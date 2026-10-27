import {SeededRandom} from '../vendor/avatar-generator/src/core/seededRandom';
import {normalizeAtmosphereVisual,type Temperament} from '../domain/presentation';
import type {SmileExpression} from '../vendor/avatar-generator/src/themes/smile/types';
export const EXPRESSION_POOLS:Record<Temperament,SmileExpression[]>={
 gentle:['smile','smile','neutral','thoughtful'],
 bright:['grin','grin','grin','smile','smile','surprised'],
 reserved:['neutral','neutral','thoughtful','smile'],
 sharp:['neutral','neutral','thoughtful','smile'],
 sensitive:['thoughtful','smile','neutral','concerned'],
 unknown:['neutral','smile','thoughtful'],
};
const FACE_PAIRS=[['#b4a78c','#ead9b8'],['#9fae9f','#d8e1ce'],['#9aa9b5','#dae3e5'],['#b99a92','#ecd4c6'],['#b6ab78','#e7deb4'],['#a7a0b5','#ded9e8']];
export function smilePreset(id:string,temperament:Temperament='unknown',colorSalt='colors'){
 const pool=EXPRESSION_POOLS[temperament]??EXPRESSION_POOLS.unknown;
 const expressionRandom=new SeededRandom(`${id}:expression`),colorRandom=new SeededRandom(`${id}:${colorSalt}`);
 return {id:`${id}:features`,size:160,expression:pool[Math.floor(expressionRandom.random()*pool.length)],foreground:FACE_PAIRS[Math.floor(colorRandom.random()*FACE_PAIRS.length)],background:'#f6f3eb',interpolate:false};
}
const PLASMA_COLORS={cold:['#4b7183','#a5b9b1','#ded9c6'],neutral:['#697c78','#b8a6a1','#e4d5b1'],warm:['#986852','#bd9e81','#e2d5a6']};
const RHYTHM={calm:{scale1:3.1,scale2:2.8,scale3:42,weight1:.8,weight2:.7,weight3:.75},flowing:{scale1:5.2,scale2:4.6,scale3:68,weight1:.8,weight2:.9,weight3:1.1},agitated:{scale1:8.1,scale2:7.6,scale3:92,weight1:1,weight2:1.1,weight3:1.3}};
export function plasmaPreset(id:string,visual?:unknown){const v=normalizeAtmosphereVisual(visual)??{temperature:'neutral',rhythm:'flowing'};return {id,size:384,foreground:PLASMA_COLORS[v.temperature],interpolate:false,...RHYTHM[v.rhythm]};}
