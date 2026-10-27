/** A misplaced key can identify only an exact old ID in this entity's own table. */
export function returnedIdentity<T extends Record<string,any>>(row:T,known:{has(id:string):boolean}):T|undefined {
 const key=typeof row.key==='string'?row.key.trim():'';
 if(!key||!known.has(key))return row;
 if(Object.hasOwn(row,'id'))return typeof row.id==='string'&&row.id.trim()===key?row:undefined;
 return {...row,id:key};
}
