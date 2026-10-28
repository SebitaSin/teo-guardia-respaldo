import test from 'node:test';
import assert from 'node:assert/strict';
import {storageGet,storageSet} from '../safe-storage.ts';
test('sin almacenamiento del navegador conserva datos en memoria sin afirmar persistencia',()=>{
 const previous=(globalThis as any).window;
 (globalThis as any).window={get localStorage(){throw new Error('blocked');}};
 try{assert.equal(storageSet('test.fallback','confirmed-manual-duty'),false);assert.equal(storageGet('test.fallback'),'confirmed-manual-duty');}
 finally{(globalThis as any).window=previous;}
});
