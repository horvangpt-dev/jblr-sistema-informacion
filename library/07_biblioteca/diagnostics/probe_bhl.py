import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

URL='https://www.biodiversitylibrary.org/bibliography/155289'
s=requests.Session()
s.headers['User-Agent']='Mozilla/5.0 JBLR-Biblioteca-BHL-Probe/0.1'
r=s.get(URL,timeout=30,allow_redirects=True)
print('PAGE',r.status_code,r.url,r.headers.get('content-type'),len(r.content))
print('HEAD',r.text[:300].replace('\n',' '))
soup=BeautifulSoup(r.text,'html.parser')
for a in soup.find_all('a',href=True):
    text=' '.join(a.stripped_strings)
    href=urljoin(r.url,a['href'])
    low=(text+' '+href).lower()
    if any(k in low for k in ['v.4','v.5','v.7(2)','v.10','v.11','v.15','v.16','v.17','v.18','v.19','v.20','volume','external','download','item/']):
        print('LINK',repr(text),href)
