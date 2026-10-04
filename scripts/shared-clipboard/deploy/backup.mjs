// Run in an isolated container with /data and /config read-only, /backup new.
// A backup includes secrets; keep the destination private, outside source trees.
import { Database } from 'bun:sqlite';
import { copyFile, chmod, readFile, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import path from 'node:path';
import { custodyPublicKey } from '../custody.mjs';
process.umask(0o077);
export async function backupService(dataDir, configDir, outputDir) {
  for (const dir of [dataDir, configDir, outputDir]) if (!path.isAbsolute(dir) || !(await stat(dir)).isDirectory()) throw Error('backup_path');
  const config = JSON.parse(await readFile(path.join(configDir, 'service.json'), 'utf8'));
  const names = ['copicu-issuer.pem', 'service.json', 'oidc-client-secret', ...(config.version===2?['copicu-custody.key']:[])];
  if (![1,2].includes(config.version)) throw Error('backup_config_version');
  for(const name of names) {
    const file=path.join(configDir,name), metadata=await stat(file);
    if(!metadata.isFile() || (process.platform!=='win32' && (metadata.mode&0o077))) throw Error('backup_secret_permissions');
    if(name==='copicu-custody.key' && metadata.size!==32) throw Error('backup_custody_secret');
  }
  const database=path.join(outputDir,'relay.sqlite');
  const db = new Database(path.join(dataDir,'relay.sqlite'),{readonly:true});
  try { db.run('PRAGMA busy_timeout=5000'); db.query('VACUUM INTO ?').run(database); } finally { db.close(); }
  await chmod(database,0o600);
  for(const name of names) { await copyFile(path.join(configDir,name),path.join(outputDir,name),constants.COPYFILE_EXCL); await chmod(path.join(outputDir,name),0o600); }
  const check=new Database(database,{readonly:true});
  let pem, rootKey;
  try {
    if(Object.values(check.query('PRAGMA integrity_check').get())[0]!=='ok') throw Error('backup_integrity');
    // Verify the copied set, not only source files: a consistent DB paired with
    // a replaced issuer/secret (or legacy config) cannot be restored safely.
    const savedConfig=JSON.parse(await readFile(path.join(outputDir,'service.json'),'utf8'));
    if(JSON.stringify(savedConfig)!==JSON.stringify(config)) throw Error('backup_config_changed');
    const meta=check.query('SELECT environment,issuer_public_key FROM relay_meta').get();
    if(!meta || meta.environment!==savedConfig.environment) throw Error('backup_environment_mismatch');
    pem=await readFile(path.join(outputDir,'copicu-issuer.pem'));
    const signer=createPrivateKey(pem);
    if(signer.asymmetricKeyType!=='ed25519' || !createPublicKey(signer).export({type:'spki',format:'der'}).subarray(-32).equals(Buffer.from(meta.issuer_public_key))) throw Error('backup_issuer_mismatch');
    const hasVault=!!check.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='custody_identity'").get();
    if(hasVault && savedConfig.version!==2) throw Error('backup_custody_secret_required');
    if(savedConfig.version===2) {
      rootKey=await readFile(path.join(outputDir,'copicu-custody.key'));
      const kem=custodyPublicKey(rootKey);
      if(hasVault && check.query('SELECT kem FROM custody_identity WHERE environment=?').get(meta.environment)?.kem!==kem) throw Error('backup_custody_mismatch');
    }
  } finally { pem?.fill(0); rootKey?.fill(0); check.close(); }
  const receipt={checkedAt:new Date().toISOString(),method:'SQLite VACUUM INTO',integrity:'ok',issuerAndConfigurationPreserved:true,custodySecretPreserved:config.version===2,storedIdentitiesVerified:true};
  await writeFile(path.join(outputDir,'receipt.json'),JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
  return receipt;
}
if(import.meta.main) {
  try { await backupService('/data','/config','/backup'); console.log('Consistent sharing backup verified. No private content displayed.'); }
  catch { console.error('Sharing backup failed. Keep the previous verified backup and check private paths, permissions and configuration.'); process.exitCode=1; }
}
