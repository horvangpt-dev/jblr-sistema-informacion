#!/usr/bin/env python3
import os,sys,csv,io,json,gzip,base64,hashlib,time,urllib.request,urllib.parse,urllib.error
from pathlib import Path
from collections import Counter
from datetime import datetime,timezone

BASE="https://api.iucnredlist.org/api/v4"; N=523; QSHA="ea883a40aff5275646b864782fccd4835ecee7e28a26c1847e6be4287d2ac656"
QB64="""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"""
OUT=Path(os.getenv("IUCN_OUT","artifacts/iucn_unknown_523_fresh")); TOKEN=os.getenv("IUCN_API_TOKEN","").strip()
WAIT=float(os.getenv("IUCN_WAIT_SECONDS","0.65"))
def ts(): return datetime.now(timezone.utc).isoformat()
def norm(s): return " ".join(str(s or "").replace("×","x").replace(" ssp. "," subsp. ").split())
def parts(name):
 p=norm(name).split()
 if len(p)<2:return None
 genus=p[0]; species=p[2] if len(p)>2 and p[1].lower()=="x" else p[1]; rank=infra=None
 for marker,r in (("subsp.","subspecies"),("var.","variety")):
  if marker in p and p.index(marker)+1<len(p): i=p.index(marker);rank=r;infra=p[i+1]
 return genus,species,rank,infra
def taxa(root):
 out=[];seen=set()
 def walk(x):
  if not isinstance(x,dict):return
  k=(x.get("sis_id"),x.get("scientific_name"))
  if x.get("scientific_name") and k not in seen:seen.add(k);out.append(x)
  for z in ("species_taxa","infrarank_taxa","subpopulation_taxa"):
   for y in x.get(z) or []:walk(y)
 walk(root);return out
def choose(name,root):
 target=norm(name); c=taxa(root); e=[x for x in c if norm(x.get("scientific_name"))==target]
 if len(e)==1:return e[0],"EXACT_SCIENTIFIC_NAME",None
 if len(e)>1:return None,None,"AMBIGUOUS_EXACT_SCIENTIFIC_NAME"
 p=parts(name)
 if p and p[3]:
  g,s,r,i=p; q=[]
  for x in c:
   it=str(x.get("infra_type") or "").lower()
   rok=(r=="subspecies" and it in ("subspecies","ssp","subsp")) or (r=="variety" and it in ("variety","var"))
   if str(x.get("genus_name") or "").lower()==g.lower() and str(x.get("species_name") or "").lower()==s.lower() and str(x.get("infra_name") or "").lower()==i.lower() and rok:q.append(x)
  if len(q)==1:return q[0],"EXPLICIT_INFRASTRUCTURE_MATCH",None
  if len(q)>1:return None,None,"AMBIGUOUS_INFRASTRUCTURE_MATCH"
 return None,None,"NO_EXACT_TAXON_MATCH"
def global_(a):
 for s in a.get("scopes") or []:
  if str(s.get("code") or "")=="1" or str((s.get("description") or {}).get("en") or "").lower()=="global":return True
 return False
def get(path,q=None):
 if not TOKEN:raise RuntimeError("IUCN_API_TOKEN_MISSING")
 url=BASE+path+("?" + urllib.parse.urlencode(q) if q else "")
 req=urllib.request.Request(url,headers={"Authorization":TOKEN,"Accept":"application/json","User-Agent":"JBLR-STIMES-AMENAZA-IUCN-FRESH/1.0"})
 last=""
 for a in range(5):
  try:
   with urllib.request.urlopen(req,timeout=45) as r:
    x=json.loads(r.read().decode()); status=r.status
   time.sleep(WAIT);return x,url,status
  except urllib.error.HTTPError as e:
   last=f"HTTP {e.code}"
   if e.code in (401,403):raise RuntimeError(last)
   if e.code==404:time.sleep(WAIT);return None,url,404
   if e.code==429 or e.code>=500:time.sleep(min(30,2**a+WAIT));continue
   raise
  except Exception as e:last=repr(e);time.sleep(min(30,2**a))
 raise RuntimeError(last)
def jl(f,o): f.write(json.dumps(o,ensure_ascii=False,sort_keys=True)+"\n");f.flush()
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 qb=gzip.decompress(base64.b64decode(QB64))
 if hashlib.sha256(qb).hexdigest()!=QSHA:raise RuntimeError("QUEUE_HASH_MISMATCH")
 rows=list(csv.DictReader(io.StringIO(qb.decode())))
 if len(rows)!=N:raise RuntimeError(f"QUEUE_COUNT_{len(rows)}")
 (OUT/"IUCN_UNKNOWN_523_QUEUE_USED.csv").write_bytes(qb)
 fields="universe_index family requested_taxon state match_method iucn_scientific_name sis_taxon_id assessment_id assessment_year category_code category_description assessment_url citation lookup_url assessment_api_url retrieved_at".split()
 issues="universe_index family requested_taxon state detail lookup_url retrieved_at".split()
 sc=Counter();cc=Counter();started=ts()
 with open(OUT/"IUCN_UNKNOWN_523_RESULTS.csv","w",encoding="utf-8",newline="") as rf,open(OUT/"IUCN_UNKNOWN_523_ISSUES.csv","w",encoding="utf-8",newline="") as ef,open(OUT/"IUCN_UNKNOWN_523_LOOKUP_RAW.jsonl","w",encoding="utf-8") as lr,open(OUT/"IUCN_UNKNOWN_523_ASSESSMENT_RAW.jsonl","w",encoding="utf-8") as ar:
  rw=csv.DictWriter(rf,fieldnames=fields);iw=csv.DictWriter(ef,fieldnames=issues);rw.writeheader();iw.writeheader()
  for n,row in enumerate(rows,1):
   name=row["taxon"]; p=parts(name); t=ts(); res={k:"" for k in fields};res.update(universe_index=row["universe_index"],family=row["family"],requested_taxon=name,retrieved_at=t)
   def finish(state,detail=""):
    res["state"]=state;rw.writerow(res);sc[state]+=1
    if detail:iw.writerow(dict(universe_index=row["universe_index"],family=row["family"],requested_taxon=name,state=state,detail=detail,lookup_url=res["lookup_url"],retrieved_at=ts()))
   if not p:finish("UNPARSABLE_REQUESTED_NAME","Cannot derive genus/species");continue
   try:
    lookup,u,status=get("/taxa/scientific_name",{"genus_name":p[0],"species_name":p[1]});res["lookup_url"]=u;jl(lr,{"universe_index":row["universe_index"],"requested_taxon":name,"retrieved_at":ts(),"http_status":status,"url":u,"payload":lookup})
    if status==404 or not isinstance(lookup,dict) or not lookup.get("taxon"):finish("TAXON_NOT_FOUND_BY_IUCN_API","Fresh scientific-name lookup returned no taxon");continue
    x,m,err=choose(name,lookup["taxon"])
    if not x:finish(err or "NO_EXACT_TAXON_MATCH","No synonym or parent-taxon substitution permitted");continue
    res.update(match_method=m,iucn_scientific_name=x.get("scientific_name") or "",sis_taxon_id=x.get("sis_id") or "")
    ass=lookup.get("assessments") or []; rootid=lookup["taxon"].get("sis_id"); xid=x.get("sis_id")
    if xid and xid!=rootid:
     sp,su,ss=get(f"/taxa/sis/{xid}");jl(lr,{"universe_index":row["universe_index"],"requested_taxon":name,"retrieved_at":ts(),"http_status":ss,"url":su,"payload":sp,"purpose":"selected_infrarank_assessments"})
     if isinstance(sp,dict):ass=sp.get("assessments") or []
    ga=[a for a in ass if global_(a)]; la=[a for a in ga if a.get("latest") is True]
    if not ga:finish("NO_GLOBAL_ASSESSMENT");continue
    if not la:finish("GLOBAL_ASSESSMENT_PRESENT_NO_LATEST_FLAG",f"global={len(ga)} latest=0");continue
    if len(la)>1:
     for a in la:
      if a.get("assessment_id"):
       z,zu,zs=get(f"/assessment/{a['assessment_id']}");jl(ar,{"universe_index":row["universe_index"],"requested_taxon":name,"retrieved_at":ts(),"http_status":zs,"url":zu,"payload":z,"purpose":"multiple_latest_global_preservation"})
     finish("MULTIPLE_LATEST_GLOBAL_ASSESSMENTS",",".join(str(a.get("assessment_id")) for a in la));continue
    a=la[0];aid=a.get("assessment_id")
    if not aid:finish("LATEST_GLOBAL_MISSING_ASSESSMENT_ID");continue
    z,zu,zs=get(f"/assessment/{aid}");res["assessment_api_url"]=zu;jl(ar,{"universe_index":row["universe_index"],"requested_taxon":name,"retrieved_at":ts(),"http_status":zs,"url":zu,"payload":z})
    if not isinstance(z,dict):finish("ASSESSMENT_FETCH_FAILED");continue
    cat=z.get("red_list_category") or {};code=cat.get("code");desc=(cat.get("description") or {}).get("en")
    res.update(assessment_id=z.get("assessment_id") or aid,assessment_year=z.get("year_published") or a.get("year_published") or "",category_code=code or "",category_description=desc or "",assessment_url=z.get("url") or a.get("url") or "",citation=z.get("citation") or "",retrieved_at=ts())
    st="GLOBAL_ASSESSMENT_RESOLVED" if code else "GLOBAL_ASSESSMENT_CATEGORY_MISSING";finish(st,"" if code else "Assessment lacks red_list_category.code")
    if code:cc[str(code)]+=1
   except Exception as e:finish("API_ERROR_AFTER_RETRIES",repr(e)[:1200])
   if n%25==0:print(f"processed={n}/{N}")
 qa={"execution_id":"IUCN_UNKNOWN_523_FRESH_v1","started_at":started,"finished_at":ts(),"source":"IUCN Red List API v4","fresh_external_query":True,"saved_evidence_used_for_taxon_results":False,"saved_data_used_only_for_queue_membership":True,"queue_sha256":QSHA,"expected_taxa":N,"observed_taxa":len(rows),"state_counts":dict(sorted(sc.items())),"category_counts":dict(sorted(cc.items())),"token_persisted_in_artifacts":False,"wait_seconds_between_calls":WAIT,"no_silent_synonym_or_parent_fallback":True}
 (OUT/"IUCN_UNKNOWN_523_QA.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
 print(json.dumps({"execution_id":qa["execution_id"],"states":qa["state_counts"],"categories":qa["category_counts"]},ensure_ascii=False))
if __name__=="__main__":main()
