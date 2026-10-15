import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {clearAsyncMemo,useAsync} from '../src/data/hooks';
afterEach(cleanup);beforeEach(clearAsyncMemo);
function pending<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
it('does not show the previous game while a new research key loads',async()=>{
 const next=pending<string>();const {result,rerender}=renderHook(({id})=>useAsync(id,()=>id==='a'?Promise.resolve('Game A'):next.promise),{initialProps:{id:'a'}});
 await waitFor(()=>expect(result.current.data).toBe('Game A'));rerender({id:'b'});expect(result.current.data).toBeUndefined();expect(result.current.loading).toBe(true);
 await act(async()=>next.resolve('Game B'));expect(result.current.data).toBe('Game B');
});
it('cannot replace current research with a late result for a different key',async()=>{
 const old=pending<string>();const {result,rerender}=renderHook(({id})=>useAsync(id,()=>id==='a'?old.promise:Promise.resolve('Game B')),{initialProps:{id:'a'}});
 rerender({id:'b'});await waitFor(()=>expect(result.current.data).toBe('Game B'));await act(async()=>old.resolve('Game A'));expect(result.current.data).toBe('Game B');
});
it('disabling a key removes previous research and does not call its loader',async()=>{
 const loader=vi.fn(async()=> 'Game A');const {result,rerender}=renderHook(({id}:{id:string|null})=>useAsync(id,loader),{initialProps:{id:'a' as string|null}});
 await waitFor(()=>expect(result.current.data).toBe('Game A'));rerender({id:null});expect(result.current.data).toBeUndefined();expect(result.current.loading).toBe(false);expect(loader).toHaveBeenCalledTimes(1);
});
it('uses the correct warm cache when returning to an earlier identity',async()=>{
 const loader=vi.fn(async(id:string)=>id);const {result,rerender}=renderHook(({id})=>useAsync(id,()=>loader(id)),{initialProps:{id:'a'}});await waitFor(()=>expect(result.current.data).toBe('a'));
 rerender({id:'b'});await waitFor(()=>expect(result.current.data).toBe('b'));rerender({id:'a'});expect(result.current.data).toBe('a');expect(loader).toHaveBeenCalledTimes(2);
});
