/*!
 * @license
 * chartjs-chart-financial
 * http://chartjs.org/
 * Version: 0.1.0
 *
 * Copyright 2020 Chart.js Contributors
 * Released under the MIT license
 * https://github.com/chartjs/chartjs-chart-financial/blob/master/LICENSE.md
 */
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(require("chart.js")):"function"==typeof define&&define.amd?define(["chart.js"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).Chart)}(this,(function(e){"use strict";function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var n=t(e);
/*!
     * Chart.js v3.0.0-beta.7
     * https://www.chartjs.org
     * (c) 2020 Chart.js Contributors
     * Released under the MIT License
     */function o(e){if(Array.isArray&&Array.isArray(e))return!0;const t=Object.prototype.toString.call(e);return"[object"===t.substr(0,7)&&"Array]"===t.substr(-6)}function l(e){return null!==e&&"[object Object]"===Object.prototype.toString.call(e)}function r(e,t){return void 0===e?t:e}function a(e){if(o(e))return e.map(a);if(l(e)){const t=Object.create(null),n=Object.keys(e),o=n.length;let l=0;for(;l<o;++l)t[n[l]]=a(e[n[l]]);return t}return e}function i(e,t,n,o){if(!function(e){return-1===["__proto__","prototype","constructor"].indexOf(e)}(e))return;const r=t[e],i=n[e];l(r)&&l(i)?s(r,i,o):t[e]=a(i)}function s(e,t,n){const r=o(t)?t:[t],a=r.length;if(!l(e))return e;const s=(n=n||{}).merger||i;for(let o=0;o<a;++o){if(!l(t=r[o]))continue;const a=Object.keys(t);for(let o=0,l=a.length;o<l;++o)s(a[o],e,t,n)}return e}!function(){let e=!1;try{const t={get passive(){return e=!0,!1}};window.addEventListener("test",null,t),window.removeEventListener("test",null,t)}catch(e){}}();e.defaults.financial={label:"",parsing:!1,hover:{mode:"label"},datasets:{categoryPercentage:.8,barPercentage:.9,animation:{numbers:{type:"number",properties:["x","y","base","width","open","high","low","close"]}}},scales:{x:{type:"timeseries",offset:!0,ticks:{major:{enabled:!0},fontStyle:e=>e.tick.major?"bold":void 0,source:"data",maxRotation:0,autoSkip:!0,autoSkipPadding:75,sampleSize:100},afterBuildTicks:e=>{const t=window&&window.luxon&&window.luxon.DateTime;if(!t)return;const n=e._majorUnit,o=e.ticks,l=o[0];let r=t.fromMillis(o[0].value);"minute"===n&&0===r.second||"hour"===n&&0===r.minute||"day"===n&&9===r.hour||"month"===n&&r.day<=3&&1===r.weekday||"year"===n&&1===r.month?l.major=!0:l.major=!1;let a=r.get(n);for(let e=1;e<o.length;e++){const l=o[e];r=t.fromMillis(l.value);const i=r.get(n);l.major=i!==a,a=i}e.ticks=o}},y:{type:"linear"}},plugins:{tooltip:{intersect:!1,mode:"index",callbacks:{label(t){const n=t.dataPoint;if(null!=n.y)return e.Chart.defaults.interaction.callbacks.label(t);const{o:o,h:l,l:r,c:a}=n;return`O: ${o}  H: ${l}  L: ${r}  C: ${a}`}}}}};class c extends e.BarController{getLabelAndValue(e){const t=this.getParsed(e),{o:n,h:o,l:l,c:r}=t,a=`O: ${n}  H: ${o}  L: ${l}  C: ${r}`;return{label:`${this._cachedMeta.iScale.getLabelForValue(t.t)}`,value:a}}getAllParsedValues(){const e=this._cachedMeta._parsed,t=[];for(let n=0;n<e.length;++n)t.push(e[n].t);return t}getMinMax(e){const t=this._cachedMeta,n=t._parsed;if(n.length<2)return{min:0,max:1};if(e===t.iScale)return{min:n[0].t,max:n[n.length-1].t};let o=Number.POSITIVE_INFINITY,l=Number.NEGATIVE_INFINITY;for(let e=0;e<n.length;e++){const t=n[e];o=Math.min(o,t.l),l=Math.max(l,t.h)}return{min:o,max:l}}_getRuler(){const e=this,t=e._cachedMeta,n=t.iScale,o=[];for(let l=0;l<t.data.length;++l)o.push(n.getPixelForValue(e.getParsed(l).t));const l=function(e,t){let n,o,l,r,a=e._length;for(l=1,r=t.length;l<r;++l)a=Math.min(a,Math.abs(t[l]-t[l-1]));for(l=0,r=e.ticks.length;l<r;++l)o=e.getPixelForTick(l),a=l>0?Math.min(a,Math.abs(o-n)):a,n=o;return a}(n,o);return{min:l,pixels:o,start:n._startPixel,end:n._endPixel,stackCount:e._getStackCount(),scale:n}}calculateElementProperties(e,t,n,o){const l=this,r=l._cachedMeta.vScale,a=r.getBasePixel(),i=l._calculateBarIndexPixels(e,t,o),s=l.chart.data.datasets[l.index].data[e],c=r.getPixelForValue(s.o),d=r.getPixelForValue(s.h),h=r.getPixelForValue(s.l),u=r.getPixelForValue(s.c);return{base:n?a:h,x:i.center,y:(h+d)/2,width:i.size,open:c,high:d,low:h,close:u}}draw(){const e=this,t=e.chart,n=e._cachedMeta.data;var o,l;o=t.ctx,l=t.chartArea,o.save(),o.beginPath(),o.rect(l.left,l.top,l.right-l.left,l.bottom-l.top),o.clip();for(let t=0;t<n.length;++t)n[t].draw(e._ctx);!function(e){e.restore()}(t.ctx)}}function d(e,t,n,o){const l=null===t,r=null===n,a=!(!e||l&&r)&&function(e,t){const{x:n,y:o,base:l,width:r,height:a}=e.getProps(["x","low","high","width","height"],t);let i,s,c,d,h;return e.horizontal?(h=a/2,i=Math.min(n,l),s=Math.max(n,l),c=o-h,d=o+h):(h=r/2,i=n-h,s=n+h,c=Math.min(o,l),d=Math.max(o,l)),{left:i,top:c,right:s,bottom:d}}(e,o);return a&&(l||t>=a.left&&t<=a.right)&&(r||n>=a.top&&n<=a.bottom)}e.Chart.defaults.elements.financial={color:{up:"rgba(80, 160, 115, 1)",down:"rgba(215, 85, 65, 1)",unchanged:"rgba(90, 90, 90, 1)"}};class h extends e.Element{height(){return this.base-this.y}inRange(e,t,n){return d(this,e,t,n)}inXRange(e,t){return d(this,e,null,t)}inYRange(e,t){return d(this,null,e,t)}getRange(e){return"x"===e?this.width/2:this.height/2}getCenterPoint(e){const{x:t,low:n,high:o}=this.getProps(["x","low","high"],e);return{x:t,y:(o+n)/2}}tooltipPosition(e){const{x:t,open:n,close:o}=this.getProps(["x","open","close"],e);return{x:t,y:(n+o)/2}}}const u=e.Chart.defaults;class g extends h{draw(e){const t=this,{x:n,open:o,high:l,low:a,close:i}=t;let s,c=t.borderColor;"string"==typeof c&&(c={up:c,down:c,unchanged:c}),i<o?(s=r(c?c.up:void 0,u.elements.candlestick.borderColor),e.fillStyle=r(t.color?t.color.up:void 0,u.elements.candlestick.color.up)):i>o?(s=r(c?c.down:void 0,u.elements.candlestick.borderColor),e.fillStyle=r(t.color?t.color.down:void 0,u.elements.candlestick.color.down)):(s=r(c?c.unchanged:void 0,u.elements.candlestick.borderColor),e.fillStyle=r(t.color?t.color.unchanged:void 0,u.elements.candlestick.color.unchanged)),e.lineWidth=r(t.borderWidth,u.elements.candlestick.borderWidth),e.strokeStyle=r(s,u.elements.candlestick.borderColor),e.beginPath(),e.moveTo(n,l),e.lineTo(n,Math.min(o,i)),e.moveTo(n,a),e.lineTo(n,Math.max(o,i)),e.stroke(),e.fillRect(n-t.width/2,i,t.width,o-i),e.strokeRect(n-t.width/2,i,t.width,o-i),e.closePath()}}g.id="candlestick",g.defaults=s({},[u.elements.financial,{borderColor:u.elements.financial.color.unchanged,borderWidth:1}]);class m extends c{updateElements(e,t,n,o){const l=this,r=l.getDataset(),a=l._ruler||l._getRuler(),i=l.resolveDataElementOptions(t,o),s=l.getSharedOptions(i),c=l.includeOptions(o,s);l.updateSharedOptions(s,o,i);for(let i=t;i<n;i++){const t=s||l.resolveDataElementOptions(i,o),n={...l.calculateElementProperties(i,a,"reset"===o,t),datasetLabel:r.label||"",color:r.color,borderColor:r.borderColor,borderWidth:r.borderWidth};c&&(n.options=t),l.updateElement(e[i],i,n,o)}}}m.id="candlestick",m.defaults=s({dataElementType:g.id},n.default.defaults.financial);const f=e.Chart.defaults;class p extends h{draw(e){const t=this,{x:n,open:o,high:l,low:a,close:i}=t,s=r(t.armLengthRatio,f.elements.ohlc.armLengthRatio);let c=r(t.armLength,f.elements.ohlc.armLength);null===c&&(c=t.width*s*.5),e.strokeStyle=i<o?r(t.color?t.color.up:void 0,f.elements.ohlc.color.up):i>o?r(t.color?t.color.down:void 0,f.elements.ohlc.color.down):r(t.color?t.color.unchanged:void 0,f.elements.ohlc.color.unchanged),e.lineWidth=r(t.lineWidth,f.elements.ohlc.lineWidth),e.beginPath(),e.moveTo(n,l),e.lineTo(n,a),e.moveTo(n-c,o),e.lineTo(n,o),e.moveTo(n+c,i),e.lineTo(n,i),e.stroke()}}p.id="ohlc",p.defaults=s({},[f.elements.financial,{lineWidth:2,armLength:null,armLengthRatio:.8}]);class b extends c{updateElements(e,t,n,o){const l=this,r=l.getDataset(),a=l._ruler||l._getRuler(),i=l.resolveDataElementOptions(t,o),s=l.getSharedOptions(i),c=l.includeOptions(o,s);for(let t=0;t<n;t++){const n=s||l.resolveDataElementOptions(t,o),i={...l.calculateElementProperties(t,a,"reset"===o,n),datasetLabel:r.label||"",lineWidth:r.lineWidth,armLength:r.armLength,armLengthRatio:r.armLengthRatio,color:r.color};c&&(i.options=n),l.updateElement(e[t],t,i,o)}}}b.id="ohlc",b.defaults=s({dataElementType:p.id,datasets:{barPercentage:1,categoryPercentage:1}},e.Chart.defaults.financial),e.Chart.register(m,b,g,p)}));