/* arn0ld2000 SMHI Card — fristående Home Assistant-kort. */
(() => {
'use strict';
/* SunCalc 1.9.0
Copyright (c) 2014, Vladimir Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/
const SunCalc=(()=>{

// shortcuts for easier to read formulas

var PI   = Math.PI,
    sin  = Math.sin,
    cos  = Math.cos,
    tan  = Math.tan,
    asin = Math.asin,
    atan = Math.atan2,
    acos = Math.acos,
    rad  = PI / 180;

// sun calculations are based on http://aa.quae.nl/en/reken/zonpositie.html formulas


// date/time constants and conversions

var dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

function toJulian(date) { return date.valueOf() / dayMs - 0.5 + J1970; }
function fromJulian(j)  { return new Date((j + 0.5 - J1970) * dayMs); }
function toDays(date)   { return toJulian(date) - J2000; }


// general calculations for position

var e = rad * 23.4397; // obliquity of the Earth

function rightAscension(l, b) { return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l)); }
function declination(l, b)    { return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)); }

function azimuth(H, phi, dec)  { return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)); }
function altitude(H, phi, dec) { return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H)); }

function siderealTime(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }

function astroRefraction(h) {
    if (h < 0) // the following formula works for positive altitudes only.
        h = 0; // if h = -0.08901179 a div/0 would occur.

    // formula 16.4 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
    // 1.02 / tan(h + 10.26 / (h + 5.10)) h in degrees, result in arc minutes -> converted to rad:
    return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

// general sun calculations

function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }

function eclipticLongitude(M) {

    var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), // equation of center
        P = rad * 102.9372; // perihelion of the Earth

    return M + C + P + PI;
}

function sunCoords(d) {

    var M = solarMeanAnomaly(d),
        L = eclipticLongitude(M);

    return {
        dec: declination(L, 0),
        ra: rightAscension(L, 0)
    };
}


var SunCalc = {};


// calculates sun position for a given date and latitude/longitude

SunCalc.getPosition = function (date, lat, lng) {

    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),

        c  = sunCoords(d),
        H  = siderealTime(d, lw) - c.ra;

    return {
        azimuth: azimuth(H, phi, c.dec),
        altitude: altitude(H, phi, c.dec)
    };
};


// sun times configuration (angle, morning name, evening name)

var times = SunCalc.times = [
    [-0.833, 'sunrise',       'sunset'      ],
    [  -0.3, 'sunriseEnd',    'sunsetStart' ],
    [    -6, 'dawn',          'dusk'        ],
    [   -12, 'nauticalDawn',  'nauticalDusk'],
    [   -18, 'nightEnd',      'night'       ],
    [     6, 'goldenHourEnd', 'goldenHour'  ]
];

// adds a custom time to the times config

SunCalc.addTime = function (angle, riseName, setName) {
    times.push([angle, riseName, setName]);
};


// calculations for sun times

var J0 = 0.0009;

function julianCycle(d, lw) { return Math.round(d - J0 - lw / (2 * PI)); }

function approxTransit(Ht, lw, n) { return J0 + (Ht + lw) / (2 * PI) + n; }
function solarTransitJ(ds, M, L)  { return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L); }

function hourAngle(h, phi, d) { return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d))); }
function observerAngle(height) { return -2.076 * Math.sqrt(height) / 60; }

// returns set time for the given sun altitude
function getSetJ(h, lw, phi, dec, n, M, L) {

    var w = hourAngle(h, phi, dec),
        a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
}


// calculates sun times for a given date, latitude/longitude, and, optionally,
// the observer height (in meters) relative to the horizon

SunCalc.getTimes = function (date, lat, lng, height) {

    height = height || 0;

    var lw = rad * -lng,
        phi = rad * lat,

        dh = observerAngle(height),

        d = toDays(date),
        n = julianCycle(d, lw),
        ds = approxTransit(0, lw, n),

        M = solarMeanAnomaly(ds),
        L = eclipticLongitude(M),
        dec = declination(L, 0),

        Jnoon = solarTransitJ(ds, M, L),

        i, len, time, h0, Jset, Jrise;


    var result = {
        solarNoon: fromJulian(Jnoon),
        nadir: fromJulian(Jnoon - 0.5)
    };

    for (i = 0, len = times.length; i < len; i += 1) {
        time = times[i];
        h0 = (time[0] + dh) * rad;

        Jset = getSetJ(h0, lw, phi, dec, n, M, L);
        Jrise = Jnoon - (Jset - Jnoon);

        result[time[1]] = fromJulian(Jrise);
        result[time[2]] = fromJulian(Jset);
    }

    return result;
};


// moon calculations, based on http://aa.quae.nl/en/reken/hemelpositie.html formulas

function moonCoords(d) { // geocentric ecliptic coordinates of the moon

    var L = rad * (218.316 + 13.176396 * d), // ecliptic longitude
        M = rad * (134.963 + 13.064993 * d), // mean anomaly
        F = rad * (93.272 + 13.229350 * d),  // mean distance

        l  = L + rad * 6.289 * sin(M), // longitude
        b  = rad * 5.128 * sin(F),     // latitude
        dt = 385001 - 20905 * cos(M);  // distance to the moon in km

    return {
        ra: rightAscension(l, b),
        dec: declination(l, b),
        dist: dt
    };
}

SunCalc.getMoonPosition = function (date, lat, lng) {

    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),

        c = moonCoords(d),
        H = siderealTime(d, lw) - c.ra,
        h = altitude(H, phi, c.dec),
        // formula 14.1 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
        pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H));

    h = h + astroRefraction(h); // altitude correction for refraction

    return {
        azimuth: azimuth(H, phi, c.dec),
        altitude: h,
        distance: c.dist,
        parallacticAngle: pa
    };
};


// calculations for illumination parameters of the moon,
// based on http://idlastro.gsfc.nasa.gov/ftp/pro/astro/mphase.pro formulas and
// Chapter 48 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.

SunCalc.getMoonIllumination = function (date) {

    var d = toDays(date || new Date()),
        s = sunCoords(d),
        m = moonCoords(d),

        sdist = 149598000, // distance from Earth to Sun in km

        phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra)),
        inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi)),
        angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) -
                cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));

    return {
        fraction: (1 + cos(inc)) / 2,
        phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
        angle: angle
    };
};


function hoursLater(date, h) {
    return new Date(date.valueOf() + h * dayMs / 24);
}

// calculations for moon rise/set times are based on http://www.stargazing.net/kepler/moonrise.html article

SunCalc.getMoonTimes = function (date, lat, lng, inUTC) {
    var t = new Date(date);
    if (inUTC) t.setUTCHours(0, 0, 0, 0);
    else t.setHours(0, 0, 0, 0);

    var hc = 0.133 * rad,
        h0 = SunCalc.getMoonPosition(t, lat, lng).altitude - hc,
        h1, h2, rise, set, a, b, xe, ye, d, roots, x1, x2, dx;

    // go in 2-hour chunks, each time seeing if a 3-point quadratic curve crosses zero (which means rise or set)
    for (var i = 1; i <= 24; i += 2) {
        h1 = SunCalc.getMoonPosition(hoursLater(t, i), lat, lng).altitude - hc;
        h2 = SunCalc.getMoonPosition(hoursLater(t, i + 1), lat, lng).altitude - hc;

        a = (h0 + h2) / 2 - h1;
        b = (h2 - h0) / 2;
        xe = -b / (2 * a);
        ye = (a * xe + b) * xe + h1;
        d = b * b - 4 * a * h1;
        roots = 0;

        if (d >= 0) {
            dx = Math.sqrt(d) / (Math.abs(a) * 2);
            x1 = xe - dx;
            x2 = xe + dx;
            if (Math.abs(x1) <= 1) roots++;
            if (Math.abs(x2) <= 1) roots++;
            if (x1 < -1) x1 = x2;
        }

        if (roots === 1) {
            if (h0 < 0) rise = i + x1;
            else set = i + x1;

        } else if (roots === 2) {
            rise = i + (ye < 0 ? x2 : x1);
            set = i + (ye < 0 ? x1 : x2);
        }

        if (rise && set) break;

        h0 = h2;
    }

    var result = {};

    if (rise) result.rise = hoursLater(t, rise);
    if (set) result.set = hoursLater(t, set);

    if (!rise && !set) result[ye > 0 ? 'alwaysUp' : 'alwaysDown'] = true;

    return result;
};



return SunCalc;})();
const VERSION = '1.5.3';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => v === null || v === undefined || v === '' || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const fmt = (v, digits=1) => num(v) === null ? '—' : new Intl.NumberFormat('sv-SE',{maximumFractionDigits:digits}).format(Number(v));
const names = {'clear-night':'Klart','cloudy':'Mulet','fog':'Dimma','hail':'Hagel','lightning':'Åska','lightning-rainy':'Åska och regn','partlycloudy':'Växlande molnighet','pouring':'Kraftigt regn','rainy':'Regn','snowy':'Snö','snowy-rainy':'Snöblandat regn','sunny':'Soligt','windy':'Blåsigt','windy-variant':'Blåsigt och molnigt','exceptional':'Ovanligt väder'};
const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function windMS(v,unit){const f={'m/s':1,'km/h':1/3.6,'mph':0.44704,'kn':0.514444,'kt':0.514444,'ft/s':0.3048};return num(v)===null || f[unit]===undefined ? null : Number(v)*f[unit];}
function celsius(v,unit){return num(v)===null ? null : unit==='°F' ? (Number(v)-32)*5/9 : unit==='°C' ? Number(v) : null;}
function millimetres(v,unit){return num(v)===null ? null : unit==='in' ? Number(v)*25.4 : unit==='mm' ? Number(v) : null;}
function bearing(v){if(num(v)!==null)return ((Number(v)%360)+360)%360;const i=dirs.indexOf(String(v).toUpperCase());return i<0 ? null : i*22.5;}
function windColor(v){return v===null?'var(--muted)':v<5?'#77c9ab':v<10?'#f4ce78':v<15?'#ffa16e':'#ff777e';}
function rainColor(v){return v===null?'var(--muted)':v===0?'var(--muted)':v<1?'#8ad9ed':v<5?'#65b7ff':'#b4a0ff';}
const paths = {
 wind:'<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 0-3-3M3 16h9a3 3 0 1 1-3 3"/>',
 drop:'<path d="M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/>',
 gauge:'<path d="M4 19a10 10 0 1 1 16 0Z"/><path d="m12 13 4-5M5 12h1m6-7v1m6 6h1"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
 rise:'<path d="M3 19h18M5 15a7 7 0 0 1 14 0M12 12V3m-3 3 3-3 3 3"/>',
 set:'<path d="M3 19h18M5 15a7 7 0 0 1 14 0M12 3v9m-3-3 3 3 3-3"/>',
 refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
 arrow:'<path d="M12 3v18M7 16l5 5 5-5"/>',
 cloud:'<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11Z"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
 thunder:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
 frost:'<path d="M12 2v20M4 6l16 12M20 6 4 18M8 3l4 3 4-3M8 21l4-3 4 3M2 10l4 2-1 4M22 10l-4 2 1 4"/>'
};
function icon(name,cls=''){return `<svg class="symbol ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.cloud}</svg>`;}
// Patch existing nodes in place: HA's ha-card, focus and scroll containers stay mounted.
function patchChildren(parent,desired){
 const key=n=>n.nodeType===1?(n.getAttribute('data-key')||n.getAttribute('data-day')||n.getAttribute('data-time')||''):'';
 let cursor=parent.firstChild;
 for(const wanted of [...desired.childNodes]){
  const k=key(wanted);let current=cursor;
  if(k&&key(current||{})!==k)current=[...parent.childNodes].find(n=>key(n)===k)||null;
  const compatible=current&&current.nodeType===wanted.nodeType&&(current.nodeType!==1||current.tagName===wanted.tagName)&&(!k||key(current)===k);
  if(!compatible){const fresh=wanted.cloneNode(true);parent.insertBefore(fresh,cursor);cursor=fresh.nextSibling;continue;}
  if(current!==cursor)parent.insertBefore(current,cursor);
  if(current.nodeType===3){if(current.nodeValue!==wanted.nodeValue)current.nodeValue=wanted.nodeValue;}
  else if(current.nodeType===1){
   const frozen=current.getAttribute('data-static');
   if(!(frozen&&frozen===wanted.getAttribute('data-static'))){
    for(const a of [...current.attributes])if(!wanted.hasAttribute(a.name))current.removeAttribute(a.name);
    for(const a of [...wanted.attributes])if(current.getAttribute(a.name)!==a.value)current.setAttribute(a.name,a.value);
    patchChildren(current,wanted);
   }
  }
  cursor=current.nextSibling;
 }
 while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
}
function tempColor(t){return t===null?'#edf3fa':t<0?'#93c9ff':t<10?'#a9e1ef':t<18?'#f3dda7':t<25?'#ffc378':'#ff8e81';}
let instanceSequence=0;
let svgSequence=0;
function rainLevelFor(condition,amount){
 const wet=['rainy','pouring','lightning-rainy','snowy-rainy'].includes(condition);
 const mm=num(amount);
 if(['snowy','hail'].includes(condition))return 0;
 if(mm!==null&&mm>0){
  if(mm>=40)return 6;       // Extremt skyfall
  if(mm>=24)return 5;       // Skyfall
  if(mm>=15)return 4;       // Mycket kraftigt regn
  if(mm>=5)return 3;        // Kraftigt regn
  if(mm>=1)return 2;        // Måttligt regn
  return 1;                 // Lätt regn
 }
 // Behåll vädersymbolen trogen SMHI även om mängden saknas eller är 0.
 return wet?(condition==='pouring'?4:1):0;
}
function weatherIcon(condition,large=false,rainMm=null){
 const id='nw-'+(++svgSequence),rainLevel=rainLevelFor(condition,rainMm),wet=rainLevel>0,night=condition==='clear-night'&&!wet;
 const snow=['snowy','snowy-rainy'].includes(condition),hail=condition==='hail';
 const cloudy=wet||hail||!['sunny','clear-night','unknown','unavailable'].includes(condition),staticKey=`${condition}-${rainLevel}`;
 const storm=condition==='lightning'||condition==='lightning-rainy';
 const fog=condition==='fog',windy=condition==='windy'||condition==='windy-variant';
 const cloudTop=storm?'#b8c5d4':rainLevel>=4?'#aebdce':wet?'#d0dce8':condition==='cloudy'||fog?'#e5ebf0':'#f4f8ff';
 const cloudBottom=storm?'#53677d':rainLevel>=4?'#536a82':wet?'#7189a1':condition==='cloudy'||fog?'#9cabb8':'#91b2d3';
 const defs=`<defs><linearGradient id="${id}-cloud" x2="0" y2="1"><stop stop-color="${cloudTop}"/><stop offset="1" stop-color="${cloudBottom}"/></linearGradient><radialGradient id="${id}-sun"><stop stop-color="#fff8d5"/><stop offset=".65" stop-color="#ffd15e"/><stop offset="1" stop-color="#f3a447"/></radialGradient><linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="${night?'#13213d':storm?'#283451':wet?'#354d69':'#376e9c'}"/><stop offset="1" stop-color="${night?'#355b7b':storm?'#74849a':'#a5cad6'}"/></linearGradient><filter id="${id}-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
 const sun=`<g class="sun-rays" stroke="#ffd97b" stroke-width="2.3" stroke-linecap="round"><path d="M32 5v5m0 44v5M5 32h5m44 0h5M13 13l4 4m30 30 4 4M13 51l4-4M47 17l4-4"/></g><circle cx="32" cy="32" r="15" fill="url(#${id}-sun)"/>`;
 const cloud=`<g class="cloud-drift"><path d="M14 43a9 9 0 0 1-1-18 13 13 0 0 1 24-5 11 11 0 1 1 8 23Z" fill="url(#${id}-cloud)"/><path d="M15 42h29" stroke="#c8ddeb" stroke-opacity=".5" stroke-width="1.3"/></g>`;
 const descriptions={1:'Lätt regn',2:'Måttligt regn',3:'Kraftigt regn',4:'Mycket kraftigt regn',5:'Skyfall',6:'Extremt skyfall'};
 let shape='';
 if(night){shape='<path d="M39 10A23 23 0 1 0 52 45 25 25 0 0 1 39 10Z" fill="#e7edff"/><g class="twinkle" fill="#fff5c0"><circle cx="50" cy="15" r="1.5"/><circle cx="55" cy="29" r="1"/><circle cx="13" cy="20" r="1"/></g>';}
 else if(condition==='sunny')shape=sun;
 else {
  if(condition==='partlycloudy')shape+=`<g transform="translate(-2 -6) scale(.77)">${sun}</g>`;
  if(condition==='cloudy'||condition==='windy-variant')shape+='<g class="cloud-back" opacity=".82"><ellipse cx="28" cy="37" rx="21" ry="11" fill="#aebdca"/></g>';
  shape+=cloud;
 }
 if(wet){
  // Drop count, stroke, angle and speed make rain amount legible even at 40 px.
  const count=[0,3,6,10,13,16,18][rainLevel],duration=[0,2.5,1.8,1.1,.78,.59,.42][rainLevel];
  const positions=[12,21,30,39,48,55,16,25,34,43,52,10,22,36,48,57,28,40];
  const palette=['','#bcecff','#8bdcff','#64c5ff','#43a8f3','#2389dd','#176bb7'];
  const lines=positions.slice(0,count).map((x,i)=>{
   const y=43+(i%5)*2, len=rainLevel>=5?11:rainLevel>=3?8:6;
   const dx=rainLevel>=4?-3:-2;
   return `<path class="rain-fall rain-drop-${i%3}" style="animation-delay:-${i*.11}s;animation-duration:${duration}s" d="M${x} ${y}q-1 2 ${dx} ${len}"/>`;
  }).join('');
  shape+=`<g class="rain-layer rain-level-${rainLevel}" fill="none" stroke="${palette[rainLevel]}" stroke-width="${[0,1.5,1.8,2.2,2.7,3.1,3.5][rainLevel]}" stroke-linecap="round">${lines}</g>`;
  if(rainLevel>=5){
   const splashes=rainLevel===6?'<path d="M8 59q4-5 8 0m8 1q5-7 10 0m8-1q5-7 10 0m3 1q3-4 6 0"/>':'<path d="M15 59q4-5 8 0m10 1q4-6 8 0m8-1q4-5 7 0"/>';
   shape+=`<g class="rain-splash" fill="none" stroke="#a5e6ff" stroke-width="1.4" stroke-linecap="round">${splashes}</g>`;
  }
 }
 if(snow){
  shape+=`<g class="snow-layer" stroke="#f4fbff" stroke-width="1.1" stroke-linecap="round">${[14,23,32,41,50,18,29,40,51].slice(0,condition==='snowy-rainy'?5:9).map((x,i)=>{const y=49+(i%3)*3;return `<g class="snow-fall" style="animation-delay:-${i*.39}s;animation-duration:${2.1+(i%3)*.4}s" transform="translate(${x} ${y})"><path d="M-2 0h4M0-2v4M-1.5-1.5l3 3m0-3-3 3"/></g>`;}).join('')}</g>`;
 }
 if(hail)shape+='<g class="hail-layer" fill="#d6f5ff" stroke="#70cfff" stroke-width="1"><circle class="hail-stone" cx="19" cy="51" r="3"/><circle class="hail-stone" cx="31" cy="55" r="2.5"/><circle class="hail-stone" cx="45" cy="50" r="3.2"/></g>';
 if(storm){
  shape+='<path class="lightning-glow" d="m34 31-11 17h8l-4 14 18-23h-9l5-8Z" fill="#fff5a1" opacity=".48" filter="url(#'+id+'-glow)"/><path class="lightning" d="m34 30-11 18h8l-4 14 18-23h-9l5-9Z" fill="#ffe36e" stroke="#fff6c6" stroke-width="1" stroke-linejoin="round"/>';
  if(condition==='lightning-rainy')shape+='<path class="lightning-secondary" d="m48 43-5 8h4l-2 7 8-10h-4l2-5Z" fill="#fff2a3" opacity=".9"/>';
 }
 if(fog)shape+='<g class="fog-lines" fill="none" stroke="#d7e9ef" stroke-width="2.2" stroke-linecap="round"><path d="M8 48h48M12 53h39M7 58h31"/></g>';
 if(windy)shape+=condition==='windy-variant'?'<g class="wind-lines wind-variant" fill="none" stroke="#b8e7f3" stroke-width="2.4" stroke-linecap="round"><path d="M5 49h43q8 0 8-5t-7-4m-42 17h32q7 0 7 4t-6 4"/></g>':'<g class="wind-lines" fill="none" stroke="#b8e7f3" stroke-width="2.4" stroke-linecap="round"><path d="M5 50h46q8 0 8-5t-7-4M10 57h34"/></g>';
 if(condition==='exceptional')shape+='<g class="exceptional-mark" fill="#ffb45e"><path d="M51 8v11m0 4v1" stroke="#ffca7d" stroke-width="3" stroke-linecap="round"/><circle cx="51" cy="51" r="2"/></g>';
 const rainLabel=wet&&descriptions[rainLevel]?`, ${descriptions[rainLevel]}${num(rainMm)!==null?`, ${fmt(rainMm)} mm`:''}`:'';
 if(large)return `<svg class="weather-scene ${wet?'weather-rain-'+rainLevel:''}" viewBox="0 0 220 130" role="img" aria-label="${esc(names[condition]||'Väderuppgift saknas')}${rainLabel}">${defs}<rect width="220" height="130" rx="20" fill="url(#${id}-sky)"/><circle cx="164" cy="37" r="34" fill="#e0efff" opacity=".07"/><path d="M0 94Q35 67 83 94T220 85V130H0Z" fill="#466b76"/><path d="M0 110Q68 80 123 106T220 101V130H0Z" fill="#294f5f"/><path d="M0 120Q60 105 114 119T220 115V130H0Z" fill="#193e50"/><g transform="translate(66 2) scale(1.4)">${shape}</g><g stroke="#a4d9e5" opacity=".3" stroke-linecap="round"><path d="M20 117h30m65 7h38m17-12h28"/></g></svg>`;
 return `<svg data-static="${esc(staticKey)}" class="weather-icon ${wet?'weather-rain-'+rainLevel:''} ${storm?'weather-storm':''} ${hail?'weather-hail':''}" viewBox="0 0 64 64" role="img" aria-label="${esc(names[condition]||'Väderuppgift saknas')}${rainLabel}">${defs}${shape}</svg>`;
}
const css = `
.weather-scene{width:48%;max-width:220px;height:auto;flex:none;border-radius:20px;box-shadow:0 9px 25px #07152530}.sun-rays{transform-origin:32px 32px;animation:sun-turn 45s linear infinite}.cloud-drift{animation:cloud-drift 7s ease-in-out infinite alternate}.rain-fall{animation:rain-fall 1.2s linear infinite;stroke-dasharray:1 2}.weather-rain-1 .rain-fall{opacity:.78}.weather-rain-2 .rain-fall{opacity:.86}.weather-rain-3 .rain-fall{opacity:.93}.weather-rain-4 .rain-fall,.weather-rain-5 .rain-fall,.weather-rain-6 .rain-fall{opacity:1}.weather-rain-4 .rain-fall{stroke:#43a8f3}.weather-rain-5 .rain-fall{stroke:#2389dd;stroke-dasharray:2 1}.weather-rain-6 .rain-fall{stroke:#176bb7;stroke-dasharray:3 1}.rain-splash{animation:splash-pop .8s ease-in-out infinite alternate;transform-origin:center}.lightning{animation:flash 3.3s linear infinite;transform-origin:32px 44px}.lightning-secondary{animation:flash 3.3s linear infinite;animation-delay:.18s}.lightning-glow{animation:flash 3.3s linear infinite}.fog-lines{animation:fog-drift 4s ease-in-out infinite alternate}.hail-stone{animation:hail-bounce 1.4s ease-in infinite}.wind-variant{animation-duration:1.8s}.cloud-back{animation:cloud-drift 9s ease-in-out infinite alternate}.wind-lines{animation:wind-lines 2.6s ease-in-out infinite alternate}.snow-fall{animation:snow-fall 3s linear infinite}.twinkle{animation:twinkle 3s ease-in-out infinite alternate}.lightning{animation:flash 3.3s linear infinite;transform-origin:32px 44px}.days,.hours{cursor:grab;user-select:none}.days.dragging,.hours.dragging{cursor:grabbing;scroll-snap-type:none}.dragging button{cursor:grabbing}button{-webkit-tap-highlight-color:transparent}.days button,.hours button{cursor:inherit}@keyframes sun-turn{to{transform:rotate(360deg)}}@keyframes cloud-drift{to{transform:translateX(3px)}}@keyframes rain-fall{from{transform:translate(2px,-5px);opacity:0}20%{opacity:1}to{transform:translate(-3px,7px);opacity:.2}}@keyframes splash-pop{from{opacity:.35;transform:scale(.9)}to{opacity:1;transform:scale(1.08)}}@keyframes fog-drift{to{transform:translateX(4px);opacity:.55}}@keyframes hail-bounce{from{transform:translateY(-5px);opacity:.5}70%{opacity:1}to{transform:translateY(5px);opacity:.9}}@keyframes wind-lines{to{transform:translateX(4px);opacity:.45}}@keyframes snow-fall{from{transform:translateY(-4px);opacity:0}40%{opacity:1}to{transform:translate(3px,7px);opacity:0}}@keyframes twinkle{to{opacity:.3}}@keyframes flash{0%,91%,95%,100%{opacity:1}92%,94%{opacity:.15}}

:host{display:block;overflow-anchor:none;--bg:var(--ha-card-background,var(--card-background-color,#17212c));--ink:var(--primary-text-color,#ecf3fa);--muted:var(--secondary-text-color,#9eafc0);--line:rgba(135,161,184,.19);--blue:#65b7ff;--panel:rgba(112,149,182,.075);font-family:var(--paper-font-body1_-_font-family,system-ui,sans-serif);color:var(--ink)}
*{box-sizing:border-box}ha-card{display:block;background:var(--bg);border:1px solid var(--line);border-radius:22px;overflow:hidden;color:var(--ink)}button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent;padding:0;touch-action:manipulation}button:focus-visible{outline:2px solid var(--blue);outline-offset:-3px;border-radius:12px}button:hover{background:rgba(128,160,191,.12)}.symbol{width:19px;height:19px;flex:none;vertical-align:middle}.hero{padding:22px 22px 16px;background:radial-gradient(ellipse at 90% 25%,rgba(91,175,234,.21),transparent 66%),linear-gradient(135deg,rgba(93,159,206,.07),rgba(170,195,207,.02))}.topline{display:flex;align-items:center;justify-content:space-between;gap:8px}.eyebrow{color:var(--muted);font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:650}.title{font-size:18px;font-weight:650;margin:5px 0}.datebutton{font-size:12px;color:var(--muted);border-radius:6px}.refresh{padding:8px;border-radius:50%;color:var(--muted)}.current{display:flex;align-items:center;justify-content:space-between;margin:12px 0 16px;gap:10px}.tempbutton{text-align:left;border-radius:12px;padding:2px 6px 2px 0}.bigtemp{font-size:54px;line-height:1.12;letter-spacing:-.05em;font-weight:550}.bigtemp small{font-size:26px;color:var(--muted);margin-left:4px;font-weight:400;letter-spacing:0}.condition{font-size:15px;margin-top:4px}.weather-icon{width:43px;height:43px;display:block;margin:auto}.weather-icon.large{width:100px;height:100px;margin:0}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px}.metric{padding:10px 11px;background:var(--panel);border:1px solid var(--line);border-radius:12px;font-size:13px;min-width:0}.metric .value{display:flex;align-items:center;gap:7px;font-weight:600;flex-wrap:wrap;min-height:21px}.metric .sub{color:var(--muted);font-size:10px;margin-top:5px;letter-spacing:.025em}.direction{display:inline-flex;align-items:center;gap:2px;font-size:11px}.direction .symbol{width:14px;height:14px}.sunbox{margin-top:14px}.sunlabels{display:flex;align-items:center;justify-content:space-between;font-size:12px;gap:6px;color:var(--muted)}.sunlabels span{display:inline-flex;gap:5px;align-items:center}.sunlabels .symbol{width:15px;height:15px;color:#d5a855}.suntrack{position:relative;margin:11px 5px 5px;height:4px;border-radius:4px;background:var(--line)}.sunfill{height:100%;background:linear-gradient(90deg,#d7a768,#f4d895);border-radius:4px}.sunpoint{position:absolute;top:-4px;width:12px;height:12px;border:2px solid var(--bg);background:#ffd780;border-radius:50%;transform:translateX(-50%)}.section{padding:18px 0 0;border-top:1px solid var(--line)}.sectionhead{padding:0 20px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px}.sectionhead h3{margin:0;font-size:14px;font-weight:650}.hint{font-size:10px;color:var(--muted)}.days,.hours{display:flex;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;scrollbar-color:rgba(126,161,188,.3) transparent;padding:0 14px 12px;gap:5px;scroll-snap-type:x proximity}.day{flex:0 0 91px;border:1px solid transparent;border-radius:13px;padding:9px 6px;scroll-snap-align:start;font-size:12px;min-width:0;text-align:center}.day.selected{border-color:var(--blue);background:rgba(101,183,255,.09)}.day .weekday{display:inline-block;border-radius:12px;padding:3px 7px;font-weight:650;min-width:40px}.day.today .weekday{background:#2695ed;color:white}.day .daydate{color:var(--muted);font-size:11px;margin:3px 0 6px}.minmax{margin:5px 0 7px;display:flex;flex-direction:column;gap:2px;justify-content:flex-start;align-items:center;min-height:67px}.minmax b{font-size:15px;line-height:17px;font-weight:650}.minmax span{color:var(--muted);font-size:11px;line-height:13px}.temp-range{position:relative;width:8px;height:30px;flex:none;border-radius:6px;background:rgba(157,177,196,.19);overflow:hidden}.temp-range span{position:absolute;left:0;right:0;border-radius:6px;min-height:3px;opacity:.9}.temp-range.empty{background:rgba(157,177,196,.10)}.smallrow{font-size:11px;display:flex;align-items:center;justify-content:center;gap:3px;white-space:nowrap;line-height:23px}.smallrow .symbol{width:13px;height:13px}.day .direction{display:flex;justify-content:center;color:var(--muted);margin-top:2px}.legend{display:flex;gap:12px;flex-wrap:wrap;padding:0 20px 12px;color:var(--muted);font-size:10px}.legend span{display:inline-flex;gap:4px;align-items:center}.legend .symbol{width:12px;height:12px}.hours{gap:0;padding:0 14px 14px}.hour{flex:0 0 92px;width:92px;text-align:center;border-radius:12px;scroll-snap-align:start;border:1px solid transparent;overflow:hidden}.hourtime{font-weight:650;font-size:12px;padding:8px 0 4px}.hour .weather-icon{width:33px;height:33px}.plot{width:92px;height:108px;display:block;overflow:hidden}.plot text{font-size:13px;fill:var(--ink);font-weight:600}.rainchart{height:40px;display:flex;align-items:flex-end;justify-content:center;margin:0 0 4px;border-bottom:1px solid var(--line)}.hours.dry-day .rainchart{display:none}.rainbar{width:18px;max-height:36px;border-radius:4px 4px 0 0;background:linear-gradient(0deg,#568bd1,#8bd8ec)}.hour .smallrow{font-size:11px}.gust{font-size:10px;color:var(--muted);margin:3px 0 6px;white-space:nowrap}.hour .direction{color:var(--muted);margin:3px 0 7px}.footer{padding:11px 18px;border-top:1px solid var(--line);font-size:10px;color:var(--muted);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.footer button{font-size:10px;color:var(--blue)}.notice{padding:10px 18px;color:#c99050;background:rgba(209,150,64,.09);font-size:12px;line-height:1.5}.empty{color:var(--muted);padding:20px;font-size:12px;line-height:1.6}.loading{height:95px;background:linear-gradient(90deg,transparent,var(--panel),transparent);background-size:200%;animation:pulse 2s ease infinite}.selected-label{text-transform:capitalize}.dot{display:inline-block;width:6px;height:6px;background:#77c9ab;border-radius:50%;margin-right:4px}.dot.old{background:#f4b56a}@keyframes pulse{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important}}@media(max-width:360px){.hero{padding:17px 14px}.bigtemp{font-size:46px}.weather-icon.large{width:80px;height:80px}.metric{padding:9px 8px}.metric .value{font-size:12px}.sunlabels{font-size:11px}}
.hero-v2{padding:0;position:relative;isolation:isolate;overflow:hidden;color:#f3f7fa;--muted:#bfceda;--ink:#f3f7fa;background:#304659}.hero-content{position:relative;z-index:2;padding:22px 20px 14px}.sky{position:absolute;inset:0;z-index:0;background:linear-gradient(#327ba7,#9fbfca 65%,#3d637b)}.sky.fair{background:linear-gradient(155deg,#347b9d 0%,#82b8c3 56%,#395b70 100%)}.sky.overcast{background:linear-gradient(#536473,#8296a2 65%,#3a5364)}.sky.rain{background:linear-gradient(#28394b,#5f7a8d 65%,#263e55)}.sky.night{background:linear-gradient(#0d1930,#293b5b 65%,#102638)}.sky.unknown{background:linear-gradient(#253848,#425b6e)}.sky svg{width:100%;height:100%;display:block}.hero-shade{position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,#08172480,#08172410),linear-gradient(0deg,#0a1729f2 0%,#132737cf 36%,#152a3c25 85%)}.sky-cloud{animation:sky-drift 55s ease-in-out infinite alternate}.sky-rain{animation:sky-rain 1.8s linear infinite}.sky-snow{animation:sky-snow 7s linear infinite}.sea-ripples{animation:ripples 9s ease-in-out infinite alternate}.sky-glow{animation:glow 12s ease-in-out infinite alternate}.sky-flash{animation:sky-flash 10s linear infinite}.hero-v2 .eyebrow{font-size:10px;letter-spacing:.16em;color:#d5e4ec}.place-label{display:flex;align-items:center;gap:8px;max-width:100%;margin:7px 0 3px}.place-label select{font:inherit;font-weight:650;font-size:23px;background:transparent;color:#fff;border:0;appearance:none;cursor:pointer;padding:3px 0;max-width:100%;text-overflow:ellipsis}.place-label select:focus-visible{outline:2px solid #a6d6ff;border-radius:5px}.place-label select option{background:#203548;color:#fff}.place-label>span:last-child{font-size:22px;color:#cde0ef;pointer-events:none}.coordinates{font-size:10px;letter-spacing:.04em;color:#c6d5e0}.location-block{min-width:0}.hero-v2 .title{font-size:23px}.hero-v2 .datebutton{margin-top:11px;color:#d4dfe8;font-size:12px}.hero-v2 .refresh{color:#d7e5ed;background:#172e433b}.hero-v2 .current{display:block;margin:17px 0 12px}.hero-v2 .bigtemp{font-size:76px;font-weight:450;letter-spacing:-.065em;text-shadow:0 2px 26px #04111d45;line-height:1.04}.hero-v2 .bigtemp small{font-size:31px;letter-spacing:-.03em;color:inherit;opacity:.85}.hero-v2 .condition{font-size:20px;font-weight:600;display:flex;align-items:center;gap:8px;margin-top:8px}.condition-dot{width:6px;height:6px;border-radius:50%;background:#d8eaf7;box-shadow:0 0 12px #d8eaf766}.condition-description{font-size:12px;color:#c7d8e4;margin-top:5px}.hero-v2 .today-summary{display:flex;align-items:center;justify-content:space-between;gap:clamp(4px,1vw,9px);flex-wrap:nowrap;font-size:15px;margin:15px 0 14px;color:#edf4f9}.hero-v2 .today-summary>span{white-space:nowrap;display:flex;align-items:center;gap:3px;flex:0 0 auto}.hero-v2 .today-summary .symbol{width:16px;height:16px;color:#99d7fa}.hero-v2 .today-summary .muted{color:#b9cad7;font-size:10px}.instruments{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-top:1px solid #c4d5e32b;border-bottom:1px solid #c4d5e32b;padding:16px 0 14px}.instrument{text-align:center;min-width:0;padding:0 5px}.instrument+.instrument{border-left:1px solid #c4d5e321}.dial{color:var(--accent);width:58px;height:58px;margin:0 auto 7px}.dial svg{width:100%;height:100%}.reading{font-size:25px;line-height:1.15;font-weight:600;letter-spacing:-.04em;white-space:nowrap}.reading small{display:block;font-weight:400;font-size:11px;line-height:1.6;color:#bdcedb;letter-spacing:0}.instrument-label{font-size:11px;font-weight:550;color:#d7e2eb;margin-top:5px}.instrument-sub{font-size:10px;line-height:1.6;color:#b8ccdc;margin-top:5px;min-height:32px}.instrument-sub .direction{font-size:11px}.hero-v2 .sunbox{margin-top:16px}.hero-v2 .sunlabels{font-size:11px;color:#d4dfe7}.hero-v2 .suntrack{background:#c3d4e033}.hero-footnote{font-size:9px;color:#a5baca;margin-top:10px;text-align:center}.wind-trace{animation:wind-trace 3s linear infinite}.humidity-drop{animation:dial-breathe 5s ease-in-out infinite alternate}.pressure-pulse{animation:dial-breathe 6s ease-in-out infinite alternate}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.hourly-section{position:relative;min-height:0}.hours{min-height:0}.hours-empty{min-height:100px}.days{min-height:212px}.day .minmax b{font-weight:600}button{scroll-margin:0}ha-card{overflow-anchor:none}.hero-v2 button:hover{background:#c7e1f010}
@keyframes sky-drift{from{transform:translateX(-25px)}to{transform:translateX(30px)}}@keyframes sky-rain{from{transform:translate(30px,-110px);opacity:0}15%,85%{opacity:1}to{transform:translate(-55px,340px);opacity:0}}@keyframes sky-snow{from{transform:translate(0,-170px);opacity:0}20%,80%{opacity:.7}to{transform:translate(50px,270px);opacity:0}}@keyframes ripples{to{transform:translateX(12px);opacity:.22}}@keyframes glow{to{opacity:.55}}@keyframes sky-flash{0%,94%,97%,100%{opacity:0}95%,98%{opacity:.3}}@keyframes wind-trace{to{stroke-dashoffset:-28}}@keyframes dial-breathe{to{opacity:.4}}
@media(max-width:480px){.hero-v2 .today-summary{gap:4px;font-size:14px}.hero-v2 .today-summary .symbol{width:15px;height:15px}}@media(max-width:360px){.hero-content{padding:19px 14px 13px}.hero-v2 .bigtemp{font-size:68px}.place-label select{font-size:21px}.reading{font-size:23px}.hero-v2 .today-summary{gap:3px;font-size:13px}.hero-v2 .today-summary .symbol{width:14px;height:14px}.hero-v2 .sunlabels{font-size:10px}.instrument{padding:0 3px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}

/* v1.4: compact header, vivid animated weather art, 11-day forecast */
.is-hidden{display:none!important}
.hero-weather-art{position:absolute;z-index:1;right:14px;top:52px;width:clamp(108px,30vw,148px);height:clamp(108px,30vw,148px);display:grid;place-items:center;pointer-events:none;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:radial-gradient(circle at 36% 28%,rgba(255,255,255,.25),rgba(218,239,255,.08) 68%);box-shadow:0 8px 24px #06152326,inset 0 1px 1px #ffffff35;backdrop-filter:blur(5px);opacity:.98;filter:drop-shadow(0 6px 12px #06152355);animation:hero-art-float 5s ease-in-out infinite alternate}.hero-weather-art .weather-icon{width:calc(100% - 14px);height:calc(100% - 14px);margin:0;filter:drop-shadow(0 2px 4px #07152570)}.hero-weather-art .cloud-drift{animation-duration:5s}.hero-weather-art .sun-rays{animation-duration:32s}.hero-weather-art .rain-fall{stroke-width:2.8}
@keyframes hero-art-float{to{transform:translateY(-3px)}}
.hero-content{padding:15px 18px 11px}.place-label{margin:3px 0 1px}.place-label select{font-size:20px;padding:1px 0;line-height:1.25}.hero-v2 .title{font-size:20px;margin:3px 0}.coordinates{font-size:11px}.hero-v2 .datebutton{margin-top:5px;font-size:13px}.hero-v2 .current{display:flex;align-items:center;justify-content:flex-start;gap:17px;margin:8px 0 6px}.hero-v2 .tempbutton{flex:none}.hero-v2 .bigtemp{font-size:59px}.hero-v2 .bigtemp small{font-size:25px}.hero-v2 .condition{font-size:17px;margin-top:0}.condition-dot{flex:none}.condition-description{font-size:12px;line-height:1.35;max-width:150px}.today-summary{gap:8px;font-size:12px;margin:8px 0 10px}.today-summary .muted{font-size:11px}.today-summary .risk-chip{gap:3px;font-weight:650}.risk-chip .symbol{width:13px;height:13px;color:#f6dda0}.risk-chip.frost-chip .symbol{color:#bde9ff}.instruments{padding:9px 0 8px}.instrument{display:grid;grid-template-columns:34px minmax(0,1fr);grid-template-rows:auto auto;align-items:center;text-align:left;column-gap:6px;padding:0 7px}.dial{grid-column:1;grid-row:1;width:32px;height:32px;margin:0}.reading{grid-column:2;grid-row:1;display:flex;align-items:baseline;font-size:23px;letter-spacing:-.025em}.reading small{display:inline-block;margin-left:3px;font-size:10px;line-height:1.1}.instrument-label{display:none}.instrument-sub{grid-column:1/-1;font-size:10px;line-height:1.4;min-height:0;margin-top:4px}.instrument-sub:empty{display:none}.wind-instrument .instrument-sub{margin-top:5px}.wind-meta{position:relative;display:flex;align-items:center;justify-content:center;gap:3px;white-space:nowrap}.wind-meta .direction{position:absolute;left:0;display:inline-flex;align-items:center;gap:2px;font-size:15px;font-weight:700;color:#f2f7fc}.wind-meta .direction .symbol{display:inline-block;width:14px;height:14px;color:#b9d9ef}.gust-value{font-size:12px;font-weight:550;white-space:nowrap;color:#e1eaf2}.gust-value b{font-size:11px;font-weight:500;color:#b8ccdc}.gust-value small{font-size:9px;margin-left:2px;color:#bdcedb}.humidity-instrument .reading{font-size:25px}.humidity-instrument .reading small{font-size:12px}.humidity-meta{display:flex;align-items:baseline;justify-content:center;gap:5px;white-space:nowrap;font-size:12px}.humidity-meta span{color:#c6d8e4}.humidity-meta b{font-size:13px;color:#e5f5ff;font-weight:600}.pressure-meta{display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;font-size:11px}.pressure-meta b{font-size:12px;color:var(--accent);font-weight:700}.pressure-meta span{color:#c9d5e1}.hero-v2 .sunbox{margin-top:10px}.hero-v2 .sunlabels,.moonlabels{font-size:12px}.moonlabels{display:flex;align-items:center;justify-content:space-between;gap:6px;color:var(--muted);margin-top:7px}.moonlabels>span{display:inline-flex;align-items:center;gap:5px}.moonlabels .symbol{width:15px;height:15px;color:#c7b3ee}.sun-center,.moon-center{display:flex!important;flex-direction:column;align-items:center;gap:2px;min-width:0}.moon-phase{display:inline-flex!important;align-items:center;justify-content:center;gap:4px;font-size:10px;line-height:14px;white-space:nowrap;color:#e7edf2}.moon-phase b{font-weight:600;color:#f6dda0}.moon-icon{width:15px;height:15px;flex:none}.hero-v2 .suntrack,.moontrack{position:relative;margin:8px 5px 3px;height:4px;border-radius:4px;background:rgba(205,221,234,.22)}.hero-v2 .sunfill{height:100%;background:linear-gradient(90deg,#d7a768,#f4d895);border-radius:4px}.moonfill{height:100%;background:linear-gradient(90deg,#7e91ba,#f6dda0);border-radius:4px}.moonpoint{position:absolute;top:-4px;width:12px;height:12px;border:2px solid #193044;background:#f6dda0;border-radius:50%;transform:translateX(-50%)}.moon-full-label{font-size:9px;color:#dce7ee;letter-spacing:.01em}.hero-footnote{font-size:9px;margin-top:6px}ha-card.entity-missing .hero-v2 .current,ha-card.entity-missing .hero-v2 .today-summary,ha-card.entity-missing .hero-v2 .instruments,ha-card.entity-missing .hero-v2 .sunbox,ha-card.entity-missing .hero-v2 .hero-footnote{display:none}.ha-card.entity-missing .section{display:none}.ha-card.entity-missing .footer{display:none}.ha-card.entity-missing .notice{min-height:60px;display:flex;align-items:center}
@media(max-width:360px){.hero-weather-art{width:82px;height:82px;right:8px;top:60px;opacity:.92}.hero-weather-art .weather-icon{width:70px;height:70px}.hero-content{padding:14px 12px 10px}.hero-v2 .bigtemp{font-size:52px}.place-label select{font-size:19px}.hero-v2 .today-summary{gap:3px;font-size:13px}.hero-v2 .today-summary .symbol{width:14px;height:14px}.instrument{padding:0 3px;column-gap:3px}.reading{font-size:20px}.instrument-sub{font-size:9px}.wind-meta{gap:1px}.wind-meta .direction{font-size:12px;gap:1px}.wind-meta .direction .symbol{width:11px;height:11px}.gust-value{font-size:10px}.gust-value b{font-size:9px}.gust-value small{font-size:8px}.humidity-instrument .reading{font-size:21px}.humidity-instrument .reading small{font-size:10px}.humidity-meta{font-size:10px;gap:3px}.humidity-meta b{font-size:11px}.pressure-meta{font-size:9px;gap:3px}.pressure-meta b{font-size:10px}.hero-v2 .sunlabels{font-size:10px}}

`;
class Arn0ld2000SmhiCard extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});this._uid='nws'+(++instanceSequence);this._forecasts={daily:[],hourly:[]};this._received={};this._errors={};this._seq=0;this._loading=false;this._lastAttempt=0;this._selected=null;this._onVisibility=()=>{if(!document.hidden)this._tick();};this.shadowRoot.addEventListener('click',e=>this._click(e));
 this.shadowRoot.addEventListener('change',e=>{if(e.target.matches('[data-location]')){e.stopPropagation();this._chooseLocation(Number(e.target.value));}});
 this.shadowRoot.addEventListener('pointerdown',e=>this._dragStart(e));
 this.shadowRoot.addEventListener('pointermove',e=>this._dragMove(e));
 this.shadowRoot.addEventListener('pointerleave',e=>{if(this._drag&&!this._drag.moved)this._dragEnd(e);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])this.shadowRoot.addEventListener(event,e=>this._dragEnd(e));}
 setConfig(config){
  const locations=config.locations||[{name:config.name||'Väder',entity:config.entity,latitude:config.latitude,longitude:config.longitude}];
  if(!Array.isArray(locations)||locations.length<1||locations.length>3||locations.some(l=>!l||typeof l.name!=='string'||!l.name.trim()||typeof l.entity!=='string'||!l.entity.startsWith('weather.')))throw new Error('Ange mellan en och tre platser. Varje plats behöver ett namn och en SMHI-väderentitet (weather.*).');
  this._locations=locations;this._locationIndex=0;this._baseConfig={...config};config={...config,...locations[0]};
  if(!config.entity?.startsWith('weather.'))throw new Error('Ange en weather-entitet i entity.');
  this._stop();this._config={name:'Väder',sun_entity:'sun.sun',moon_entity:'sensor.moon',days:11,refresh_minutes:15,stale_minutes:90,wind_unit:'m/s',...config};
  if(!['m/s','km/h'].includes(this._config.wind_unit))throw new Error('wind_unit måste vara m/s eller km/h.');
  this._config.days=Math.max(1,Math.min(14,Number(this._config.days)||7));this._config.refresh_minutes=Math.max(5,Number(this._config.refresh_minutes)||15);
  this._forecasts={daily:[],hourly:[]};this._received={};this._errors={};this._selected=null;this._lastAttempt=0;this._render();this._start();
 }
 _chooseLocation(index){
  if(!this._locations[index]||index===this._locationIndex)return;
  this._stop();this._locationIndex=index;
  const {latitude,longitude,name,entity,...base}=this._baseConfig;
  this._config={...this._config,...base,latitude:undefined,longitude:undefined,...this._locations[index]};
  this._units=undefined;this._forecasts={daily:[],hourly:[]};this._received={};this._errors={};this._lastAttempt=0;this._selected=null;this._resetHours=true;
  this._render();this._start();
 }
 set hass(hass){
  const old=this._hass,oldState=old?.states[this._config?.entity],oldLive=this._liveSignature();this._hass=hass;
  if(!this._config)return;
  const state=hass.states[this._config.entity];
  if(!oldState&&state)this._lastAttempt=0;
  const signature=JSON.stringify([state?.attributes?.wind_speed_unit,state?.attributes?.temperature_unit,state?.attributes?.precipitation_unit]);
  if(this._units!==undefined&&this._units!==signature){this._seq++;this._loading=false;this._forecasts={daily:[],hourly:[]};this._received={};this._lastAttempt=0;}
  this._units=signature;
  if(oldState!==state||old?.states[this._config.sun_entity]!==hass.states[this._config.sun_entity]||oldLive!==this._liveSignature()||old?.config!==hass.config)this._render();
  this._start();
 }
 get hass(){return this._hass;}
 connectedCallback(){document.addEventListener('visibilitychange',this._onVisibility);this._start();}
 disconnectedCallback(){document.removeEventListener('visibilitychange',this._onVisibility);this._stop();}
 _stop(){clearInterval(this._timer);this._timer=null;this._seq++;this._loading=false;}
 _start(){if(!this.isConnected||!this._hass||!this._config)return;if(!this._timer)this._timer=setInterval(()=>this._tick(),60000);if(!this._lastAttempt)this._fetch();}
 _tick(){if(document.hidden)return;if(Date.now()-this._lastAttempt>this._config.refresh_minutes*60000)this._fetch();else this._render();}
 _timezone(){try{const z=this._hass?.config?.time_zone||'Europe/Stockholm';new Intl.DateTimeFormat('sv-SE',{timeZone:z});return z;}catch{return 'Europe/Stockholm';}}
 _date(v,options={}){const d=new Date(v);return Number.isNaN(+d)?'—':new Intl.DateTimeFormat('sv-SE',{timeZone:this._timezone(),...options}).format(d);}
 _key(v){return this._date(v,{year:'numeric',month:'2-digit',day:'2-digit'});}
 _time(v){return this._date(v,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
 _attrs(){return this._hass?.states[this._config?.entity]?.attributes||{};}
 _smhiMetric(kind){
  const a=this._attrs(),direct=kind==='thunder'?[a.thunder_probability,a.thunder_probability_percent,a.thunder_chance]:[a.frost_probability,a.frost_chance,a.probability_of_frost,a.probability_of_frozen_precipitation];
  for(let i=0;i<direct.length;i++){const value=num(direct[i]);if(value!==null&&value>=0&&value<=100)return {value:kind==='frost'&&i===3&&value<=1?value*100:value,entity:this._config.entity};}
  const tokens=kind==='thunder'?/(thunder|lightning|åska)/i:/(frozen.?precip|frusen.?nederbörd)/i;
  const states=Object.entries(this._hass?.states||{}).filter(([id,s])=>id.startsWith('sensor.')&&tokens.test(`${id} ${s.attributes?.friendly_name||''}`)&&num(s.state)!==null);
  const place=String(this._config.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const placeMatches=place?states.filter(([id,s])=>`${id} ${s.attributes?.friendly_name||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(place.replace(/_/g,' '))||id.includes(place)):[];
  const match=placeMatches.length===1?placeMatches[0]:states.length===1?states[0]:null;
  if(match){const value=num(match[1].state);if(value!==null&&value>=0&&value<=100)return {value,entity:match[0]};}
  return {value:null,entity:null};
 }
 _liveSignature(){if(!this._hass||!this._config)return '';const a=this._attrs();return JSON.stringify([this._smhiMetric('thunder').value,this._smhiMetric('frost').value,this._hass.states[this._config.moon_entity]?.state,this._hass.states[this._config.sun_entity]?.state,a.next_rising,a.next_setting]);}
 _temp(v){return celsius(v,this._attrs().temperature_unit);}
 _rain(v){return millimetres(v,this._attrs().precipitation_unit);}
 _wind(v){const ms=windMS(v,this._attrs().wind_speed_unit);return ms===null?null:ms*(this._config.wind_unit==='km/h'?3.6:1);}
 _windColor(v){return windColor(windMS(v,this._attrs().wind_speed_unit));}
 _direction(v,showArrow=true){const b=bearing(v);return b===null?'—':`<span class="direction" title="Vind från ${dirs[Math.round(b/22.5)%16]}">${showArrow?icon('arrow').replace('class="symbol ',`style="transform:rotate(${b}deg)" class="symbol `):''}${dirs[Math.round(b/22.5)%16]}</span>`;}
 _moon(){const data=SunCalc.getMoonIllumination(new Date()),phase=((data.phase%1)+1)%1,index=Math.round(phase*8)%8,names=['Nymåne','Tilltagande skära','Första kvarteret','Tilltagande måne','Fullmåne','Avtagande måne','Sista kvarteret','Avtagande skära'],fraction=Math.max(0,Math.min(1,data.fraction)),cycle=29.530588853,sinceLastFull=((phase-.5+1)%1),daysToFull=(1-sinceLastFull)*cycle,moonState=this._hass?.states[this._config?.moon_entity]?.state,haPhases={new_moon:0,waxing_crescent:1,first_quarter:2,waxing_gibbous:3,full_moon:4,waning_gibbous:5,last_quarter:6,waning_crescent:7},haNames={new_moon:'Nymåne',waxing_crescent:'Tilltagande skära',first_quarter:'Första kvarteret',waxing_gibbous:'Tilltagande måne',full_moon:'Fullmåne',waning_gibbous:'Avtagande måne',last_quarter:'Sista kvarteret',waning_crescent:'Avtagande skära'},haIndex=haPhases[moonState];return {phase,index:Number.isInteger(haIndex)?haIndex:index,name:haNames[moonState]||names[index],percent:Math.round(fraction*100),shadowX:12+(phase<0.5?-1:1)*18*fraction,daysToFull,fullDate:new Date(Date.now()+daysToFull*86400000),progress:sinceLastFull};}
 _moonIcon(moon){return `<svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#f6dda0"/><circle cx="${moon.shadowX}" cy="12" r="9" fill="#30475c"/><circle cx="12" cy="12" r="9" fill="none" stroke="#f6dda0" stroke-opacity=".55" stroke-width=".8"/></svg>`;}
 _localNoon(date){const key=this._date(date,{year:'numeric',month:'2-digit',day:'2-digit'}),target=new Date(`${key}T12:00:00Z`),parts=new Intl.DateTimeFormat('en-GB',{timeZone:this._timezone(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(target),p=Object.fromEntries(parts.map(x=>[x.type,x.value])),shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);return new Date(+target-(shown-(+target)));}
 _moonTimes(lat,lon){if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180)return {rise:null,set:null};const now=Date.now(),base=new Date(`${this._date(now,{year:'numeric',month:'2-digit',day:'2-digit'})}T12:00:00Z`),found={rise:null,set:null};for(let i=0;i<35&&(!found.rise||!found.set);i++){const day=new Date(base);day.setUTCDate(day.getUTCDate()+i);const times=SunCalc.getMoonTimes(this._localNoon(day),lat,lon);for(const kind of ['rise','set'])if(!found[kind]&&Number.isFinite(+times[kind])&&+times[kind]>now)found[kind]=times[kind];}return found;}
 async _fetch(){
  if(this._loading||!this._hass||!this._config||!this.isConnected)return;
  if(!this._hass.states[this._config.entity]){this._lastAttempt=Date.now();this._render();return;}
  const seq=++this._seq;this._loading=true;this._lastAttempt=Date.now();this._render();
  const entity=this._config.entity,hass=this._hass;
  await Promise.all(['daily','hourly'].map(async type=>{
   let timeout;
   try{
    const request=hass.callWS({type:'call_service',domain:'weather',service:'get_forecasts',service_data:{type},target:{entity_id:entity},return_response:true});
    const result=await Promise.race([request,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Tidsgränsen för hämtningen överskreds.')),20000);})]);
    const data=result?.response?.[entity]?.forecast;
    if(!Array.isArray(data))throw new Error('Home Assistant returnerade ingen prognoslista.');
    if(seq!==this._seq)return;
    this._forecasts[type]=data.filter(x=>x&&Number.isFinite(Date.parse(x.datetime))).sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime));
    this._received[type]=Date.now();delete this._errors[type];
   }catch(err){if(seq===this._seq)this._errors[type]=String(err?.message||err?.code||'Kunde inte hämta prognosen.');}
   finally{clearTimeout(timeout);}
  }));
  if(seq!==this._seq)return;this._loading=false;this._render();
 }
 _sun(){
  const lat=num(this._config.latitude??this._hass?.config?.latitude),lon=num(this._config.longitude??this._hass?.config?.longitude);
  if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180)return {text:'Soltider saknas – ange koordinater.'};
  // Local noon keeps the SunCalc cycle on the displayed local date, including date-line time zones.
  const now=new Date(),noon=this._localNoon(now);
  const s=SunCalc.getTimes(noon,lat,lon);
  if(!Number.isFinite(+s.sunrise)||!Number.isFinite(+s.sunset))return {text:'Ingen soluppgång eller solnedgång detta dygn.'};
  const fraction=Math.max(0,Math.min(1,(+now-(+s.sunrise))/(s.sunset-s.sunrise))),minutes=Math.round((s.sunset-s.sunrise)/60000);
  return {rise:s.sunrise,set:s.sunset,fraction,text:`${Math.floor(minutes/60)} h ${minutes%60} min dagsljus`,day:+now>=+s.sunrise&&+now<=+s.sunset};
 }
 _days(){const today=this._key(Date.now()),seen=new Set();return this._forecasts.daily.filter(f=>{const k=this._key(f.datetime);if(k<today||seen.has(k))return false;seen.add(k);return true;}).slice(0,this._config.days);}
 _dragStart(e){
  if(e.pointerType!=='mouse'||e.button!==0)return;
  const el=e.target.closest('[data-scroll]');if(!el)return;
  this._drag={el,id:e.pointerId,x:e.clientX,start:el.scrollLeft,moved:false};
  e.preventDefault();
 }
 _dragMove(e){const d=this._drag;if(!d||d.id!==e.pointerId)return;
  if(!e.buttons){this._dragEnd(e);return;}
  const dx=e.clientX-d.x;
  if(!d.moved&&Math.abs(dx)<5)return;
  if(!d.moved){d.moved=true;d.el.classList.add('dragging');d.el.setPointerCapture(e.pointerId);}
  e.preventDefault();d.el.scrollLeft=d.start-dx;
 }
 _dragEnd(e){const d=this._drag;if(!d||d.id!==e.pointerId)return;
  this._drag=null;d.el.classList.remove('dragging');
  if(d.el.hasPointerCapture(e.pointerId))d.el.releasePointerCapture(e.pointerId);
  if(d.moved){this._suppressClickUntil=Date.now()+300;}
 }
 _click(e){if(Date.now()<(this._suppressClickUntil||0)){e.preventDefault();return;}const el=e.target.closest('[data-action]');if(!el)return;e.stopPropagation();e.preventDefault();const action=el.dataset.action;
  if(action==='refresh'){this._fetch();return;}
  if(action==='info'){this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:this._config.entity},bubbles:true,composed:true}));return;}
  if(action==='day'){this._selected=el.dataset.day;this._resetHours=true;this._render();return;}
  if(action==='today'){const today=this._key(Date.now());this._selected=today;this._resetHours=true;this._render();const row=this.shadowRoot.querySelector('.days');if(row)row.scrollLeft=0;return;}
 }
 _render(){
  if(!this._config||!this._hass||this._drag)return;
  const scrolls={};this.shadowRoot.querySelectorAll('[data-scroll]').forEach(el=>scrolls[el.dataset.scroll]=el.scrollLeft);

  const a=this._attrs(),state=this._hass.states[this._config.entity],today=this._key(Date.now()),days=this._days();
  const keys=days.map(f=>this._key(f.datetime));const hourKeys=[...new Set(this._forecasts.hourly.filter(f=>this._key(f.datetime)>=today).map(f=>this._key(f.datetime)))];
  const available=[...new Set([...keys,...hourKeys])].sort();
  if(!this._selected||this._selected<today||!available.includes(this._selected))this._selected=available.includes(today)?today:available[0]||today;
  const hours=this._forecasts.hourly.filter(f=>this._key(f.datetime)===this._selected && (this._selected!==today||Date.parse(f.datetime)>Date.now()-3600000));
  const condition=state?.state||'unknown',sun=this._sun();
  const status=[];
  if(!state)status.push(`Ingen SMHI-väderentitet hittades för ${this._config.name}: ${this._config.entity}. Kontrollera att SMHI-integrationen är konfigurerad för platsen och att entitets-ID:t stämmer.`);
  else if(['unknown','unavailable'].includes(condition))status.push('Väderentiteten är inte tillgänglig. Senast hämtade prognos kan fortfarande visas.');
  for(const type of ['daily','hourly']){if(this._errors[type])status.push(`${type==='daily'?'Dygnsprognos':'Timprognos'}: ${this._errors[type]}`);else if(this._received[type]&&Date.now()-this._received[type]>(Number(this._config.stale_minutes)||90)*60000)status.push(`${type==='daily'?'Dygnsprognosen':'Timprognosen'} har inte hämtats på över ${Number(this._config.stale_minutes)||90} minuter.`);}
  const dailyRange={values:days.flatMap(f=>[this._temp(f.temperature),this._temp(f.templow)]).filter(v=>v!==null)};dailyRange.min=dailyRange.values.length?Math.min(...dailyRange.values):null;dailyRange.max=dailyRange.values.length?Math.max(...dailyRange.values):null;if(dailyRange.min===dailyRange.max&&dailyRange.min!==null){dailyRange.min-=0.5;dailyRange.max+=0.5;}
  let html=`<style>${css}</style><ha-card data-key="card" class="${!state?'entity-missing':''}">${this._heroHTML(a,condition,sun,days)}`;
  if(status.length)html+=`<div data-key="notice" class="notice" role="status">${status.map(esc).join('<br>')}</div>`;
  html+=`<section data-key="daily" class="section ${!state?'is-hidden':''}"><div class="sectionhead"><h3>Kommande dagar</h3><span class="hint">Tryck på en dag · svep för fler</span></div>`;
  html+=days.length?`<div class="days ha-scrollbar" data-scroll="days">${days.map(f=>this._dayHTML(f,today,dailyRange)).join('')}</div>`:`<div class="empty ${this._loading?'loading':''}">${this._loading?'Hämtar dygnsprognos…':'Ingen dygnsprognos tillgänglig.'}</div>`;
  html+=`</section><section data-key="hourly" class="section hourly-section ${!state?'is-hidden':''}"><div class="sectionhead"><h3 class="selected-label">${this._selected===today?'I dag':this._date(this._selected+'T12:00:00Z',{weekday:'long',day:'numeric',month:'short'})} · timprognos</h3><span class="hint">Dra i sidled för fler timmar</span></div><div class="legend"><span style="color:#edc77e">● Temperatur °C</span><span>${icon('drop')}mm / prognossteg</span><span>${icon('wind')}${esc(this._config.wind_unit)}</span></div>`;
  html+=hours.length?this._hoursHTML(hours):`<div class="empty hours-empty ${this._loading?'loading':''}">${this._loading?'Hämtar timprognos…':'Ingen timprognos tillgänglig för den valda dagen.'}</div>`;
  html+=`</section><footer data-key="footer" class="footer ${!state?'is-hidden':''}"><span><i class="dot ${status.length?'old':''}"></i>Hämtat: dygn ${this._received.daily?this._time(this._received.daily):'—'} · tim ${this._received.hourly?this._time(this._received.hourly):'—'}</span><button data-action="info">SMHI · mer information ↗</button></footer></ha-card>`;
  const template=document.createElement('template');
  template.innerHTML=html;
  template.content.querySelectorAll('button').forEach(b=>b.type='button');
  // No replacing ha-card, no focus() and no global scrollTo().
  patchChildren(this.shadowRoot,template.content);
  this.shadowRoot.querySelectorAll('[data-scroll]').forEach(el=>{el.scrollLeft=this._resetHours&&el.dataset.scroll==='hours'?0:scrolls[el.dataset.scroll]||0;});this._resetHours=false;
  const select=this.shadowRoot.querySelector('[data-location]');if(select)select.value=String(this._locationIndex);
 }

 _skyHTML(condition,night,rainMm){
  const id=this._uid,rainLevel=rainLevelFor(condition,rainMm),wet=rainLevel>0,snow=['snowy','snowy-rainy','hail'].includes(condition),overcast=['cloudy','fog','pouring','rainy','lightning-rainy','snowy'].includes(condition),known=!!names[condition];
  const kind=!known?'unknown':night?'night':wet?'rain':overcast?'overcast':'fair';
  const skyRainCount=[0,7,13,20,28,36,46][rainLevel],skyRainSpeed=[0,4.2,3.3,2.4,1.8,1.35,.95][rainLevel],skyRainWidth=[0,.9,1.1,1.4,1.7,2.1,2.5][rainLevel],skyRainOpacity=[0,.22,.32,.44,.54,.65,.78][rainLevel];
  const cloud=(x,y,scale,delay)=>`<g class="sky-cloud" style="animation-delay:${delay}s"><g transform="translate(${x} ${y}) scale(${scale})" filter="url(#${id}-soft)"><ellipse cx="0" cy="0" rx="100" ry="22"/><ellipse cx="-42" cy="-17" rx="51" ry="28"/><ellipse cx="10" cy="-24" rx="64" ry="35"/><ellipse cx="60" cy="-8" rx="50" ry="24"/></g></g>`;
  return `<div class="sky ${kind}" data-static="sky-${condition}-${night}-${rainLevel}" aria-hidden="true"><svg viewBox="0 0 600 480" preserveAspectRatio="xMidYMid slice"><defs><filter id="${id}-soft" x="-40%" y="-80%" width="190%" height="260%"><feTurbulence type="fractalNoise" baseFrequency=".015" numOctaves="3" seed="5" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="29"/><feGaussianBlur stdDeviation="2.5"/></filter><radialGradient id="${id}-glow"><stop stop-color="#fff3c6" stop-opacity=".9"/><stop offset=".25" stop-color="#fff3c6" stop-opacity=".3"/><stop offset="1" stop-color="#fff3c6" stop-opacity="0"/></radialGradient><linearGradient id="${id}-sea" x2="0" y2="1"><stop stop-color="#abc1c6" stop-opacity=".45"/><stop offset="1" stop-color="#122c40" stop-opacity=".8"/></linearGradient></defs>${night?'<g fill="#fff" opacity=".5"><circle cx="380" cy="48" r="1"/><circle cx="510" cy="62" r="1.5"/><circle cx="260" cy="100" r="1"/></g>':''}<g fill="${night?'#9facbf':overcast?'#b3c1cf':'#f3f4ed'}" opacity="${known?(overcast?'.7':condition==='sunny'||condition==='clear-night'?'.14':'.45'):'.2'}">${cloud(150,90,1.6,-8)}${cloud(475,190,1.8,-24)}${overcast?cloud(270,30,2.3,-15):''}${overcast?cloud(110,250,1.4,-32):''}</g><path d="M0 324Q80 295 140 324T275 317T420 320T600 300V480H0Z" fill="#405e6c" opacity=".5"/><path d="M0 348Q120 324 210 341T390 329T600 339V480H0Z" fill="url(#${id}-sea)"/><g class="sea-ripples" stroke="#d4e1e8" stroke-width="1" opacity=".12"><path d="M40 360h80m220 7h140m-300 22h130m65 20h160M50 430h180m100 25h220"/></g>${wet?`<g stroke="#c1e7ff" stroke-width="${skyRainWidth}" opacity="${skyRainOpacity}">${Array.from({length:skyRainCount},(_,i)=>`<path class="sky-rain" style="animation-delay:-${i*.13}s;animation-duration:${skyRainSpeed}s" d="m${i*29} ${i%5*74-70}-12 48"/>`).join('')}</g>`:''}${snow?`<g fill="#fff">${Array.from({length:20},(_,i)=>`<circle class="sky-snow" style="animation-delay:-${i*.7}s" cx="${i*31}" cy="${i%6*60}" r="${i%3+1}"/>`).join('')}</g>`:''}${condition==='fog'?'<rect width="600" height="220" y="210" fill="#d4e0e1" opacity=".15"/>':''}${condition.includes('lightning')?'<rect class="sky-flash" width="600" height="480" fill="#e9f1ff"/>':''}</svg></div>`;
 }
 _heroHTML(a,condition,sun,days){
  const missing=!this._hass?.states[this._config.entity];
  const temp=this._temp(a.temperature),today=days.find(f=>this._key(f.datetime)===this._key(Date.now()));
  const humidity=num(a.humidity),speed=this._wind(a.wind_speed),pressure=num(a.pressure),wind=windMS(a.wind_speed,a.wind_speed_unit),b=bearing(a.wind_bearing);
  const cloudCandidates=this._forecasts.hourly.filter(f=>num(f.cloud_coverage)!==null&&Math.abs(Date.parse(f.datetime)-Date.now())<=90*60000).sort((x,y)=>Math.abs(Date.parse(x.datetime)-Date.now())-Math.abs(Date.parse(y.datetime)-Date.now()));
  const cloudCoverage=num(a.cloud_coverage)??num(cloudCandidates[0]?.cloud_coverage);
  const dew=temp!==null&&humidity!==null&&humidity>0&&humidity<=100?243.12*(Math.log(humidity/100)+17.62*temp/(243.12+temp))/(17.62-Math.log(humidity/100)-17.62*temp/(243.12+temp)):null;
  const lat=num(this._config.latitude),lon=num(this._config.longitude),night=sun.rise?!sun.day:condition==='clear-night';
  const descriptions={cloudy:'Molnen täcker himlen',partlycloudy:'Sol och moln om vartannat',sunny:'Solen dominerar',rainy:'Regn över området',pouring:'Kraftigare regn',snowy:'Snöfall',fog:'Dimma och dis','clear-night':'Klar natthimmel','snowy-rainy':'Regn blandat med snö',windy:'Blåsigt väder','lightning-rainy':'Regn och åska',lightning:'Åska i prognosen'};
  const sunnyText=cloudCoverage===null?'Soligt':cloudCoverage<=10?'Nästan molnfritt':cloudCoverage<=35?'Övervägande soligt':cloudCoverage<=65?'Sol och moln':'Solglimtar mellan molnen';
  const currentRain=this._rain(a.precipitation),moon=this._moon(),moonTimes=this._moonTimes(lat,lon);
  const thunderChance=this._smhiMetric('thunder').value,frostChance=this._smhiMetric('frost').value;
  const frostLow=this._temp(today?.templow),frostValue=frostChance!==null?`${fmt(frostChance,0)} %`:`${fmt(frostLow,0)}°`;
  const fullMoonDays=Math.max(1,Math.ceil(moon.daysToFull)),fullMoonDate=this._date(moon.fullDate,{day:'numeric',month:'long'});
  const place=this._locations.length>1?`<label class="place-label"><span class="sr-only">Välj prognosplats</span><select data-location aria-label="Välj prognosplats">${this._locations.map((l,i)=>`<option value="${i}" ${i===this._locationIndex?'selected':''}>${esc(l.name)}</option>`).join('')}</select><span aria-hidden="true">⌄</span></label>`:`<h2 class="title">${esc(this._config.name)}</h2>`;
  const windDial=`<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" opacity=".2"/><path d="M32 3v6m0 46v6M3 32h6m46 0h6" stroke="currentColor" opacity=".5"/><g transform="rotate(${b??0} 32 32)" opacity="${b===null?'.25':'1'}"><path d="M32 48 22 24 32 29 42 24Z" fill="currentColor"/></g><path class="wind-trace" style="animation-duration:${Math.max(1,5-(wind||0)/4)}s" d="M7 18h12m28 28h12" stroke="currentColor" stroke-dasharray="7 7"/></svg>`;
  const humidityDial=`<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" opacity=".2"/><circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="${Math.max(0,Math.min(100,humidity??0))*1.571} 157.1" transform="rotate(-90 32 32)"/><path class="humidity-drop" d="M32 19c-4 7-9 11-9 17a9 9 0 0 0 18 0c0-6-5-10-9-17Z" fill="currentColor" opacity=".7"/></svg>`;
  const pressureHpa=pressure===null?null:a.pressure_unit==='hPa'||a.pressure_unit==='mbar'?pressure:a.pressure_unit==='inHg'?pressure*33.8639:a.pressure_unit==='mmHg'?pressure*1.33322:null;
  const angle=pressureHpa===null?0:Math.max(-110,Math.min(110,(pressureHpa-1000)*2.75));
  const pressureDelta=pressureHpa===null?null:Math.round(pressureHpa-1013.25);
  const pressureStatus=pressureHpa===null?'':pressureHpa<1005?'Lågtryck':pressureHpa>=1025?'Högtryck':'Normaltryck';
  const pressureSub=pressureDelta===null?'':`<div class="pressure-meta" title="Jämförelse mot standardtrycket 1013 hPa; detta visar inte förändringen över tid."><b>${pressureStatus}</b><span>${pressureDelta>0?'+':''}${fmt(pressureDelta,0)} hPa</span></div>`;
  const pressureDial=`<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 50a25 25 0 1 1 38 0" fill="none" stroke="currentColor" stroke-width="2" opacity=".4"/><path d="M12 32h5m15-20v5m15 15h5M18 18l3 3m22-3-3 3" stroke="currentColor"/><g transform="rotate(${angle} 32 36)" opacity="${pressureHpa===null?'.2':'1'}"><path d="M32 36V20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g><circle class="pressure-pulse" cx="32" cy="36" r="3" fill="currentColor"/></svg>`;
  const instrument=(cls,dial,value,unit,label,sub,color)=>`<div class="instrument ${cls}" role="group" aria-label="${esc(label)}" style="--accent:${color}"><div class="dial">${dial}</div><div class="reading">${value}<small>${esc(unit)}</small></div><div class="instrument-sub">${sub}</div></div>`;
  return `<header data-key="hero" class="hero hero-v2">${this._skyHTML(condition,night,currentRain)}<div class="hero-shade"></div><div class="hero-weather-art" aria-hidden="true">${weatherIcon(condition,false,currentRain)}</div><div class="hero-content"><div class="topline"><div class="location-block"><div class="eyebrow">SMHI · lokal prognos</div>${place}<div class="coordinates" title="Prognoskoordinater; ortnamnet anges i kortets konfiguration">${lat!==null&&lon!==null?`${fmt(lat,5)}° N · ${fmt(lon,5)}° E`:''}</div></div><button class="refresh" data-action="refresh" aria-label="Hämta prognosen igen" title="Hämta prognosen igen" ${this._loading?'disabled':''}>${icon('refresh')}</button></div><button class="datebutton" data-action="today">${this._date(Date.now(),{weekday:'long',day:'numeric',month:'long'})}</button><div class="current ${missing?'is-hidden':''}"><button class="tempbutton" data-action="info" aria-label="Öppna väderinformation"><div class="bigtemp" style="color:${tempColor(temp)}">${fmt(temp)}<small>°C</small></div></button><div class="condition-block"><div class="condition"><span class="condition-dot"></span>${esc(names[condition]||'Uppgift saknas')}</div><div class="condition-description">${esc(condition==='sunny'?sunnyText:descriptions[condition]||'Prognos för platsen')}</div></div></div><div class="today-summary ${missing?'is-hidden':''}"><span title="Dagens högsta temperatur">↑ ${fmt(this._temp(today?.temperature),0)}°</span><span title="Dagens lägsta temperatur">↓ ${fmt(this._temp(today?.templow),0)}°</span><span title="Nederbörd idag">${icon('drop')} ${fmt(this._rain(today?.precipitation))} mm</span>${cloudCoverage!==null?`<span title="Molntäcke ${num(a.cloud_coverage)!==null?'just nu':'i närmaste timprognos'}">${icon('cloud')} ${fmt(cloudCoverage,0)} %</span>`:''}${thunderChance!==null?`<span class="risk-chip" title="SMHI:s sannolikhet för åska">${icon('thunder')} ${fmt(thunderChance,0)} %</span>`:''}<span class="risk-chip frost-chip" title="${frostChance!==null?'Andel av nederbörden som väntas falla i frusen form; detta är inte sannolikhet för markfrost':'Frostindikator: prognostiserad lägsta temperatur i dag; ingen frostsannolikhet i väderdatan'}">${icon('frost')} ${frostValue}</span></div><div class="instruments ${missing?'is-hidden':''}">${instrument('wind-instrument',windDial,fmt(speed),this._config.wind_unit,'Vind',`<div class="wind-meta">${this._direction(a.wind_bearing,false)}<span class="gust-value"><b>Byar</b> ${fmt(this._wind(a.wind_gust_speed))}<small>${esc(this._config.wind_unit)}</small></span></div>`,this._windColor(a.wind_speed))}${instrument('humidity-instrument',humidityDial,fmt(humidity,0),'%','Luftfuktighet',`<div class="humidity-meta"><span>Daggpunkt</span><b>${fmt(dew)} °C*</b></div>`,'#9ad5f1')}${instrument('pressure-instrument',pressureDial,fmt(pressure,0),a.pressure_unit||'','Lufttryck',pressureSub,pressureDelta===null?'#cfbff0':pressureHpa<1005?'#8bc7ff':pressureHpa>=1025?'#f3d07f':'#c7b3ee')}</div><div class="sunbox ${missing?'is-hidden':''}">${sun.rise?`<div class="sunlabels"><span>${icon('rise')}${this._time(sun.rise)}</span><span class="sun-center"><span class="sun-daylight">${sun.text}</span></span><span>${icon('set')}${this._time(sun.set)}</span></div><div class="suntrack"><div class="sunfill" style="width:${sun.fraction*100}%"></div>${sun.day?`<span class="sunpoint" style="left:${sun.fraction*100}%"></span>`:''}</div>`:`<div class="hint">${sun.text}</div>`}<div class="moonlabels"><span title="Nästa månuppgång">${icon('rise')}${moonTimes.rise?this._time(moonTimes.rise):'—'}</span><span class="moon-center"><span class="moon-phase" title="Moon-integrationen ger fasnamn; belyst andel beräknas astronomiskt.">${this._moonIcon(moon)}<span>${moon.name}</span><b>${moon.percent}%</b></span><span class="moon-full-label" title="Nästa fullmåne ${fullMoonDate}">Fullmåne om ${fullMoonDays} d</span></span><span title="Nästa månnedgång">${icon('set')}${moonTimes.set?this._time(moonTimes.set):'—'}</span></div><div class="moontrack" title="Måncykelns förlopp fram till nästa fullmåne"><div class="moonfill" style="width:${moon.progress*100}%"></div><span class="moonpoint" style="left:${moon.progress*100}%"></span></div></div><div class="hero-footnote ${missing?'is-hidden':''}">* Beräknad daggpunkt · bakgrunden illustrerar prognosen</div></div></header>`;
 }
 _dayHTML(f,today,range){const key=this._key(f.datetime),rain=this._rain(f.precipitation),high=this._temp(f.temperature),low=this._temp(f.templow),span=range?.max!==null&&range?.min!==null?range.max-range.min:0,top=span>0&&high!==null?Math.max(0,Math.min(100,(range.max-high)/span*100)):0,bottom=span>0&&low!==null?Math.max(0,Math.min(100,(range.max-low)/span*100)):0,height=Math.max(4,bottom-top),avg=high!==null&&low!==null?(high+low)/2:high??low;const rangeBar=span>0&&high!==null&&low!==null?`<div class="temp-range" role="img" aria-label="Temperaturspann ${fmt(low,0)} till ${fmt(high,0)} grader"><span style="top:${top}%;height:${height}%;background:${tempColor(avg)}"></span></div>`:`<div class="temp-range empty" aria-hidden="true"></div>`;return `<button class="day ${key===today?'today':''} ${key===this._selected?'selected':''}" data-action="day" data-day="${key}" aria-pressed="${key===this._selected}" ${key===today?'aria-current="date"':''} aria-label="${esc(this._date(f.datetime,{weekday:'long',day:'numeric',month:'long'}))}, högst ${fmt(high)} grader, lägst ${fmt(low)} grader"><div class="weekday">${key===today?'I dag':this._date(f.datetime,{weekday:'short'})}</div><div class="daydate">${this._date(f.datetime,{day:'numeric',month:'short'})}</div>${weatherIcon(f.condition,false,rain)}<div class="minmax" title="Dagens temperaturspann jämfört med övriga prognosdagar"><b style="color:${tempColor(high)}">${fmt(high,0)}°</b>${rangeBar}<span>${fmt(low,0)}°</span></div><div class="smallrow" style="color:${rainColor(rain)}" title="Nederbördsmängd i dygnsprognosen">${icon('drop')}${fmt(rain)} mm</div><div class="smallrow" style="color:${this._windColor(f.wind_speed)}" title="Vindhastighet">${icon('wind')}${fmt(this._wind(f.wind_speed))} ${esc(this._config.wind_unit)}</div>${this._direction(f.wind_bearing)}</button>`;}
 _hoursHTML(hours){
  const precip=hours.map(f=>this._rain(f.precipitation)),hasRain=precip.some(v=>v!==null&&v>0);
  const temps=hours.map(f=>this._temp(f.temperature)),valid=temps.filter(v=>v!==null),min=valid.length?Math.min(...valid)-1:0,max=valid.length?Math.max(...valid)+1:1;
  const y=v=>v===null?null:83-(v-min)/(max-min)*54;
  const rainMax=Math.max(1,...hours.map(f=>this._rain(f.precipitation)||0));
  return `<div class="hours ${hasRain?'has-rain':'dry-day'} ha-scrollbar" data-scroll="hours">${hours.map((f,i)=>{
   const t=temps[i],cy=y(t),prev=y(temps[i-1]??null),next=y(temps[i+1]??null),rain=this._rain(f.precipitation);
   const left=cy!==null&&prev!==null?`M-46 ${prev}L46 ${cy}`:'',right=cy!==null&&next!==null?`M46 ${cy}L138 ${next}`:'';
   return `<div class="hour" role="group" aria-label="Prognos klockan ${this._time(f.datetime)}"><div class="hourtime">${this._time(f.datetime)}</div>${weatherIcon(f.condition,false,this._rain(f.precipitation))}<svg class="plot" viewBox="0 0 92 108" aria-hidden="true"><path d="M0 99H92" stroke="var(--line)"/><path d="${left}${right}" fill="none" stroke="#edc77e" stroke-width="2"/>${cy===null?'<text x="46" y="55" text-anchor="middle">—</text>':`<circle cx="46" cy="${cy}" r="3" fill="#edc77e"/><text style="fill:${tempColor(t)}" x="46" y="${cy-11}" text-anchor="middle">${fmt(t)}°</text>`}</svg><div class="rainchart">${rain!==null&&rain>0?`<div class="rainbar" style="height:${Math.max(3,rain/rainMax*36)}px"></div>`:''}</div><div class="smallrow" style="color:${rainColor(rain)}">${icon('drop')}${fmt(rain)} mm</div><div class="smallrow" style="color:${this._windColor(f.wind_speed)}">${icon('wind')}${fmt(this._wind(f.wind_speed))} ${esc(this._config.wind_unit)}</div><div class="gust">Byar ${fmt(this._wind(f.wind_gust_speed))}</div>${this._direction(f.wind_bearing)}</div>`;
  }).join('')}</div>`;
 }
 getCardSize(){return 13;}
 getGridOptions(){return {columns:12,min_columns:6,rows:'auto'};}
 static getStubConfig(hass){return {entity:Object.keys(hass?.states||{}).find(x=>x.startsWith('weather.'))||'weather.home',name:'Väder',wind_unit:'m/s'};}
}
if(!customElements.get('arn0ld2000-smhi-card'))customElements.define('arn0ld2000-smhi-card',Arn0ld2000SmhiCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(c=>c.type==='arn0ld2000-smhi-card'))window.customCards.push({type:'arn0ld2000-smhi-card',name:'arn0ld2000 SMHI Card',description:'SMHI-prognos med upp till tre valbara platser, animerade väderscener och detaljerade dygns- och timprognoser.',preview:true});
console.info(`arn0ld2000 SMHI Card ${VERSION}`);
})();
