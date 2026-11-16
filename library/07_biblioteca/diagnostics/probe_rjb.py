import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

URL = 'https://bibdigital.rjb.csic.es/idurl/1/9905'
s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0 JBLR-Biblioteca-Metadata-Probe/0.1'
r = s.get(URL, timeout=30, allow_redirects=True)
print('PAGE', r.status_code, r.url, r.headers.get('content-type'), len(r.content))
print('TITLE_TAG', BeautifulSoup(r.text, 'html.parser').title)

soup = BeautifulSoup(r.text, 'html.parser')
for tag in soup.find_all('script'):
    src = tag.get('src')
    if src:
        print('SCRIPT', urljoin(r.url, src))
    elif tag.string:
        txt = tag.string.strip()
        if txt:
            print('INLINE_SCRIPT', txt[:1500].replace('\n',' '))

for pattern in [r'https?://[^"\'\s<>]+', r'/(?:api|rest|records|search|items|graphql)[^"\'\s<>]*']:
    vals = sorted(set(re.findall(pattern, r.text, flags=re.I)))
    for v in vals[:100]:
        print('CANDIDATE', v)

# Fetch JS assets and print likely API/record endpoint fragments.
for tag in soup.find_all('script', src=True):
    src = urljoin(r.url, tag['src'])
    try:
        j = s.get(src, timeout=30)
        print('JS', j.status_code, src, len(j.content))
        if j.status_code == 200:
            text = j.text
            hits = sorted(set(re.findall(r'.{0,100}(?:api|idurl|record|media|medias|graphql).{0,140}', text, flags=re.I)))
            for hit in hits[:80]:
                print('JS_HIT', hit[:300].replace('\n',' '))
    except Exception as e:
        print('JS_ERROR', src, repr(e))
