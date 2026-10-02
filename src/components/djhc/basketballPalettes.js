// Exact DJHC presentation seeds and contrast resolver from basketball-palettes.js.
export const palettes = [
  ['djhc','DJHC Original','Collector Court','#4169E1','#E9B949','#D63A4B'],
  ['atl','Atlanta Hawks','Peachtree Heat','#E03A3E','#F5BE38','#26282A'],
  ['bos','Boston Celtics','Parquet Club','#007A33','#BA9653','#B2B7BB'],
  ['bkn','Brooklyn Nets','Borough Blacktop','#000000','#FFFFFF','#64748B'],
  ['cha','Charlotte Hornets','Buzz City Nights','#00788C','#A1A1A4','#1D1160'],
  ['chi','Chicago Bulls','Windy City Red','#CE1141','#CE1141','#000000'],
  ['cle','Cleveland Cavaliers','Wine Cellar','#860038','#FDBB30','#041E42'],
  ['dal','Dallas Mavericks','Metro Blue','#00538C','#B8C4CA','#002B5E'],
  ['den','Denver Nuggets','Mile High Gold','#0E2240','#FEC524','#8B2131'],
  ['det','Detroit Pistons','Motor City Court','#1D42BA','#C8102E','#BEC0C2'],
  ['gsw','Golden State Warriors','Bay Gold','#1D428A','#FFC72C','#1D428A'],
  ['hou','Houston Rockets','Launch Red','#CE1141','#C4CED4','#000000'],
  ['ind','Indiana Pacers','Fieldhouse Gold','#002D62','#FDBB30','#BEC0C2'],
  ['lac','Los Angeles Clippers','Pacific Current','#122A4A','#65B5E8','#D8394F'],
  ['lal','Los Angeles Lakers','Showtime Court','#552583','#F9A01B','#000000'],
  ['mem','Memphis Grizzlies','River City Blue','#5D76A9','#F5B112','#12173F'],
  ['mia','Miami Heat','After Hours Heat','#98002E','#F9A01B','#000000'],
  ['mil','Milwaukee Bucks','Deer District','#00471B','#EEE1C6','#0077C0'],
  ['min','Minnesota Timberwolves','North Star','#0C2340','#78BE20','#236192'],
  ['nop','New Orleans Pelicans','Crescent Court','#0C2340','#85714D','#C8102E'],
  ['nyk','New York Knicks','Garden Lights','#006BB6','#F58426','#BEC0C2'],
  ['okc','Oklahoma City Thunder','Prairie Storm','#007AC1','#FDBB30','#EF3B24'],
  ['orl','Orlando Magic','Magic Hour','#0077C0','#C4CED4','#000000'],
  ['phi','Philadelphia 76ers','Liberty Court','#006BB6','#ED174C','#002B5C'],
  ['phx','Phoenix Suns','Valley Sunset','#1D1160','#E56020','#B95915'],
  ['por','Portland Trail Blazers','Rose City Run','#E03A3E','#E03A3E','#000000'],
  ['sac','Sacramento Kings','Capital Purple','#5A2D81','#63727A','#000000'],
  ['sas','San Antonio Spurs','Alamo Silver','#000000','#C4CED4','#000000'],
  ['tor','Toronto Raptors','Northern Red','#CE1141','#B4975A','#000000'],
  ['uta','Utah Jazz','Mountain Rhythm','#6B4C9A','#9ED9F7','#17151E'],
  ['was','Washington Wizards','District Court','#002B5C','#E31837','#C4CED4'],
].map(([id,team,name,primary,highlight,trim]) => ({id,team,name,primary,highlight,trim}));
export function paletteForTeam(teamId) {
  const supplied = typeof teamId === 'string' ? teamId.trim().toLowerCase() : '';
  const id = ({brk:'bkn',cho:'cha',pho:'phx'})[supplied] || supplied;
  return palettes.find(palette => palette.id === id) || palettes[0];
}
const rgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value,16));
export function mix(a,b,amount) {
  const left=rgb(a),right=rgb(b);
  return '#'+left.map((value,index) => Math.round(value+(right[index]-value)*amount).toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function luminance(hex) {
  const channels=rgb(hex).map(value => {const channel=value/255;return channel<=.04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4;});
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
export function contrast(a,b) {const left=luminance(a),right=luminance(b);return (Math.max(left,right)+.05)/(Math.min(left,right)+.05);}
function readable(seed,backgrounds,target=4.5) {
  const end=luminance(backgrounds[0])>.3 ? '#000000' : '#FFFFFF';
  for(let step=0;step<=100;step++){const color=mix(seed,end,step/100);if(backgrounds.every(background=>contrast(color,background)>=target))return color;}
  return end;
}
export function themeFor(palette,mode='dark') {
  const dark=mode==='dark';
  const canvas=dark ? mix('#090E1A',palette.primary,.06) : mix('#F6F7FA',palette.primary,.025);
  const surface=dark ? mix('#151D2D',palette.primary,.08) : '#FFFFFF';
  const raised=dark ? mix('#202B3F',palette.primary,.08) : mix('#EDF0F5',palette.primary,.03);
  const backgrounds=[canvas,surface,raised],accent=readable(dark ? palette.highlight : palette.primary,backgrounds);
  return {canvas,surface,raised,text:readable(dark ? '#F4F6FA':'#172238',backgrounds,7),muted:readable(dark ? '#B1BED2':'#536177',backgrounds),border:readable(dark ? '#5A6980':'#8491A6',backgrounds,3),accent,onAccent:contrast('#FFFFFF',accent)>contrast('#111827',accent)?'#FFFFFF':'#111827',focus:readable(dark ? '#F4D37C':'#2449A4',backgrounds,3),trim:palette.trim,positive:readable(dark ? '#80DBB0':'#176444',backgrounds),warning:readable(dark ? '#F4D37C':'#80520D',backgrounds),error:readable(dark ? '#FFA9B4':'#AA263F',backgrounds)};
}
export function hslChannels(hex) {
  const [r,g,b]=rgb(hex).map(value=>value/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,light=(max+min)/2;
  let hue=0,saturation=0;
  if(delta){saturation=delta/(1-Math.abs(2*light-1));hue=max===r ? ((g-b)/delta)%6 : max===g ? (b-r)/delta+2 : (r-g)/delta+4;hue=(hue*60+360)%360;}
  return `${hue.toFixed(4)} ${(saturation*100).toFixed(4)}% ${(light*100).toFixed(4)}%`;
}