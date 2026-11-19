'use strict';
// Development fixtures only. Windows commonly provides python; many Linux
// installations provide only python3. Do not require a user-created shim.
const {spawnSync}=require('node:child_process');
function resolvePython(run=spawnSync){
  for(const command of ['python','python3']){
    const result=run(command,['--version'],{encoding:'utf8',windowsHide:true});
    if(result.error?.code==='ENOENT')continue;
    if(result.status===0)return command;
    throw Error('Python fixture interpreter failed: '+command);
  }
  throw Error('Python fixtures require python or python3 on PATH.');
}
module.exports={resolvePython,get python(){return resolvePython();}};
