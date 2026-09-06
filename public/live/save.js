const assertActive=signal=>{if(signal?.aborted)throw new DOMException('已取消保存','AbortError');};

// Keep permission scoped to this page; the browser owns the directory grant.
export function createLiveSaver(environment=globalThis){
  let directory=null;
  return {async choose(){
    if(typeof environment.showDirectoryPicker!=='function')return null;
    if(directory){
      if(await directory.requestPermission({mode:'readwrite'})!=='granted'){
        directory=null;throw new Error('未获得保存授权，请重新导出并选择保存位置');
      }
      return directory;
    }
    directory=await environment.showDirectoryPicker({id:'nanbo-live-export',startIn:'desktop',mode:'readwrite'});
    return directory;
  }};
}

export async function saveLivePair(directory,result,signal){
  assertActive(signal);
  const stem=result.name.replace(/\.zip$/i,'');
  const folderName=`${stem}_${result.identifier}`;
  try{
    const folder=await directory.getDirectoryHandle(folderName,{create:true});
    for(const [name,blob] of [[`${stem}.JPG`,result.photo],[`${stem}.MOV`,result.movie]]){
      assertActive(signal);
      const file=await folder.getFileHandle(name,{create:true});
      const stream=await file.createWritable();
      try{assertActive(signal);await stream.write(blob);assertActive(signal);await stream.close();}
      catch(error){await stream.abort().catch(()=>{});throw error;}
    }
    return folderName;
  }catch(error){
    if(error.name==='AbortError')throw error;
    throw new Error(`未完整保存，请检查磁盘空间与文件夹权限后重试。未完成的文件夹：${folderName}`);
  }
}
