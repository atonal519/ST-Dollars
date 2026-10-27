import {generateAvatar} from '../vendor/avatar-generator/src/themes/interference';

/** One fixed presentation texture per mounted window; unrelated to people or mood seeds. */
export function createBlueGlassTexture():string {
  return generateAvatar({id:'6',size:384,foreground:[[34,78,132],[28,113,105]],interpolate:false}).toDataURL('image/png');
}
