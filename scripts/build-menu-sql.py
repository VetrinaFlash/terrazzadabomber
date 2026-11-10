import re,sys
src=open(sys.argv[1],encoding='utf8').read().splitlines()
q=lambda s:"'"+s.replace("'","''")+"'"
cats=[];items=[];section=None
for line in src:
    line=line.rstrip()
    if not line or line.startswith('# ') and section is None: continue
    if line.startswith('@ '): section=line[2:].strip(); continue
    if line.startswith('# '):
        name,_,desc=line[2:].partition('|'); cats.append((section,name.strip(),desc.strip())); continue
    if line.startswith('- '):
        parts=[p.strip() for p in line[2:].split('|')]
        name,desc,price=parts[0],parts[1],parts[2]
        noorder=len(parts)>3 and parts[3]=='noorder'
        tags=[t.strip().lower() for t in re.findall(r'\*\s*([A-Za-zàè ]+?)(?=\s*\*|$)',desc)]
        desc=re.sub(r'\s*\*.*$','',desc).strip()
        cents=int(round(float(price.replace(',','.'))*100))
        items.append((len(cats),name,desc,cents,','.join(t.replace(' ','-') for t in tags),0 if noorder else 1))
out=[]
for i,(s,n,d) in enumerate(cats,1):
    out.append(f"INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES({i},{q(s)},{q(n)},{q(d)},{i});")
pos={}
for c,n,d,p,t,o in items:
    pos[c]=pos.get(c,0)+1
    out.append(f"INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT {c},{q(n)},{q(d)},{p},{q(t)},{o},{pos[c]} WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id={c} AND name={q(n)});")
print('\n'.join(out))
print(f"-- {len(cats)} categorie, {len(items)} voci",file=sys.stderr)
