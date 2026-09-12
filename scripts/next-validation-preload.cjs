// Explicitly prevents Next from loading project .env files in isolated validation/builds.
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request,parent,isMain){
  const loaded = originalLoad.call(this,request,parent,isMain);
  if(request === "@next/env" || request.includes("compiled/@next/env")){
    return {...loaded,loadEnvConfig:()=>({combinedEnv:process.env,parsedEnv:{},loadedEnvFiles:[]})};
  }
  return loaded;
};
