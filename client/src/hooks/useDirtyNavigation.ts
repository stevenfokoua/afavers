import {createContext,useContext} from 'react';
export const DirtyContext=createContext<(dirty:boolean,retain?:boolean)=>void>(()=>{});
export const useDirtyNavigation=()=>useContext(DirtyContext);
