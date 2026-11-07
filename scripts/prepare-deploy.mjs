import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const configPath='wrangler.json';
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const dbName=config.d1_databases[0].database_name;
const cmd=(...args)=>execFileSync('npx',['wrangler',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
function getDB(){
 const rows=JSON.parse(cmd('d1','list','--json'));
 return rows.find(x=>x.name===dbName);
}
let db=getDB();
if(!db){
 console.log('Creo il database Cloudflare D1 '+dbName);
 try{console.log(cmd('d1','create',dbName,'--location','weur'));}
 catch(e){console.log(e.stdout||''); console.error(e.stderr||''); throw e;}
 db=getDB();
}
if(!db?.uuid) throw new Error('Database D1 non trovato dopo la creazione');
config.d1_databases[0].database_id=db.uuid;
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
console.log('Database D1 collegato (id non sensibile): '+db.uuid);
