import { execFileSync } from 'node:child_process';
// The approved voice remains at 1–3s. The original soft sweep now follows
// the upper card reveal (1.4–2.1s), then leaves the final hold quiet.
const input='public/live/cards/';
const filter='[0:a]atempo=1.6,atempo=1.5625,afade=t=out:st=0.65:d=0.15,adelay=1300:all=1,apad,atrim=duration=3[out]';
execFileSync('ffmpeg',['-y','-v','error','-i',input+'sfx.m4a','-filter_complex',filter,'-map','[out]','-ar','48000','-ac','2','-c:a','aac','-b:a','192k',input+'sfx-sync.m4a']);
execFileSync('ffmpeg',['-y','-v','error','-i',input+'voice-intro.m4a','-i',input+'sfx-sync.m4a','-filter_complex','[0:a][1:a]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=0:latency=1,apad,atrim=duration=3[out]','-map','[out]','-ar','48000','-ac','2','-c:a','aac','-b:a','192k',input+'mix-sync.m4a']);
console.log('Three-second synchronized SFX and voice mix generated.');
