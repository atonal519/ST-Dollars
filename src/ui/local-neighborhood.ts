import type {WorldSnapshot,Person} from '../domain/world';
import type {ProfileRelation} from '../domain/presentation';
export type NeighborRelation=ProfileRelation&{label:string;outgoing:boolean};
export function localNeighbors(world:Pick<WorldSnapshot,'people'|'profileRelations'>,personId:string){
 const people=new Map(world.people.map(p=>[p.id,p]));const result:Array<{person:Person;label:string;relations:NeighborRelation[]}>=[];
 for(const edge of world.profileRelations??[]){const outgoing=edge.fromPersonId===personId;if(!outgoing&&edge.toPersonId!==personId)continue;
  const person=people.get(outgoing?edge.toPersonId:edge.fromPersonId);if(!person)continue;
  const label=outgoing?edge.toRole:edge.fromRole;
  let node=result.find(row=>row.person.id===person.id);if(!node){node={person,label,relations:[]};result.push(node);}
  if(!node.relations.some(row=>row.fromPersonId===edge.fromPersonId&&row.toPersonId===edge.toPersonId&&row.fromRole===edge.fromRole&&row.toRole===edge.toRole&&row.directed===edge.directed))node.relations.push({...edge,label,outgoing});
  node.label=[...new Set(node.relations.map(relation=>relation.label))].join(' / ');
 }
 return result;
}
