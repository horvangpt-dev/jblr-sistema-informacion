const { preserveNameVerbatim } = require('./source-expansion');

function xmlEscape(value) {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&apos;');
}

function buildEidosBuscarTaxonesEnvelope(name) {
  const verbatim = preserveNameVerbatim(name);
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:impl="http://impl.eidos.mapama.gob.es">` +
    `<soapenv:Header/><soapenv:Body><impl:buscarTaxones soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<nombre xsi:type="xsd:string">${xmlEscape(verbatim)}</nombre>` +
    `</impl:buscarTaxones></soapenv:Body></soapenv:Envelope>`;
}

function parseEidosBuscarTaxonesXml(xml, evidencePointer='EIDOS_SOAP_RESPONSE') {
  const text = String(xml || '');
  const blocks = [...text.matchAll(/<taxon\b[\s\S]*?<\/taxon>/gi)].map(m=>m[0]);
  const matches = [];
  for (const block of blocks) {
    const id = /<TAXONID[^>]*>([^<]+)<\/TAXONID>/i.exec(block)?.[1]?.trim();
    const name = /<SCIENTIFICNAME[^>]*>([\s\S]*?)<\/SCIENTIFICNAME>/i.exec(block)?.[1]?.trim();
    const rank = /<RANK[^>]*>([\s\S]*?)<\/RANK>/i.exec(block)?.[1]?.trim() || null;
    if (id && name) matches.push({idTaxon:id, scientificName:name, rank, evidencePointer});
  }
  return {state:'OK', matches, relations:[], evidencePointer};
}

function createEidosSoapTransport({
  endpoint='https://eportal.miteco.gob.es/IEPNB_EIDOS_WS/services/IEPNB_EIDOS',
  fetchImpl=globalThis.fetch,
}={}) {
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPL_REQUIRED');
  return async function queryEidos(name) {
    const body = buildEidosBuscarTaxonesEnvelope(name);
    const response = await fetchImpl(endpoint, {
      method:'POST',
      headers:{'content-type':'text/xml; charset=utf-8','soapaction':'buscarTaxones'},
      body,
    });
    if (!response || !response.ok) {
      return {state:'ACCESS_FAILED',accessDetail:`HTTP_${response?.status ?? 'NO_RESPONSE'}`,evidencePointer:endpoint};
    }
    const xml = await response.text();
    return parseEidosBuscarTaxonesXml(xml, endpoint);
  };
}

function hvmoIndexUrlForName(name) {
  const verbatim = preserveNameVerbatim(name);
  const first = [...verbatim.trim()][0];
  if (!first) throw new Error('NAME_REQUIRED');
  const letter = first.toLocaleUpperCase('es-ES');
  return `https://herbarivirtual.uib.es/es/general/${encodeURIComponent(letter)}/per-nom-cientific`;
}

function htmlText(value) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}

function createHvmoIndexTransport({fetchImpl=globalThis.fetch}={}) {
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPL_REQUIRED');
  return async function queryHvmo(name) {
    const url = hvmoIndexUrlForName(name);
    const response = await fetchImpl(url, {headers:{'accept':'text/html'}});
    if (!response || !response.ok) {
      return {state:'ACCESS_FAILED',accessDetail:`HTTP_${response?.status ?? 'NO_RESPONSE'}`,evidencePointer:url};
    }
    const html = await response.text();
    const text = htmlText(html);
    const present = text.includes(preserveNameVerbatim(name));
    return {
      state:'OK',
      matches: present ? [{scientificName:preserveNameVerbatim(name), sameConcept:null, evidencePointer:url}] : [],
      relations:[],
      evidencePointer:url,
      accessDetail:present?'EXACT_VISIBLE_NAME_PRESENT':'EXACT_VISIBLE_NAME_NOT_PRESENT',
    };
  };
}

function createConfiguredSearchTransport({sourceId, urlBuilder, parser, fetchImpl=globalThis.fetch}={}) {
  if (!sourceId || typeof urlBuilder !== 'function' || typeof parser !== 'function') throw new Error('SEARCH_TRANSPORT_CONFIG_REQUIRED');
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPL_REQUIRED');
  return async function configuredQuery(name) {
    const verbatim = preserveNameVerbatim(name);
    const url = urlBuilder(verbatim);
    const response = await fetchImpl(url, {headers:{'accept':'text/html,application/json,application/xml,text/xml,application/pdf'}});
    if (!response || !response.ok) return {state:'ACCESS_FAILED',accessDetail:`HTTP_${response?.status ?? 'NO_RESPONSE'}`,evidencePointer:url};
    const body = await response.text();
    return parser({sourceId,name:verbatim,url,body});
  };
}

module.exports = {
  xmlEscape,
  buildEidosBuscarTaxonesEnvelope,
  parseEidosBuscarTaxonesXml,
  createEidosSoapTransport,
  hvmoIndexUrlForName,
  htmlText,
  createHvmoIndexTransport,
  createConfiguredSearchTransport,
};
