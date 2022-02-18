const cacheName = 'cache-v1';
const resourcesToPrecache = [
	'/',
	'index.html',
	'css/index.css',
	'js/index.js',

	'images/icons/favicon-32x32.png',
	'images/icons/globe-192x192.png',
	'images/icons/globe-196x196.png',
	'images/icons/globe-512x512.png',

	'json/capital-latlng.json',
	'json/countries_small.geo.json',
	'json/country-currencies.json',
	'json/country-isos.json',
	'json/countryarray.json',
	'json/currency-cns.json',
	'json/quartiles.json',
	'json/top10.json',
	
	'vendors/bootstrap/css/bootstrap.min.css',
	'vendors/bootstrap/css/bootstrap.min.css.map',
	'vendors/bootstrap/js/bootstrap-4-3-1.min.js',
	'vendors/bootstrap/js/popper.min.js',

	'vendors/chartjs/chart-candle.js',
	'vendors/chartjs/chartjs-adapter-luxon.js',
	'vendors/chartjs/chartjs-chart-financial.js',

	'vendors/fontawesome/font-awesome.min.css',

	'vendors/jquery/jquery-3.6.0.min.js',

	'vendors/leaflet/leaflet.css',
	'vendors/leaflet/leaflet.js',
	'vendors/leaflet/easybutton/easy-button.css',
	'vendors/leaflet/easybutton/easy-button.js',

	'vendors/luxon/luxon.js',

	'vendors/typeahead/typeahead.bundle.min.js',
	'vendors/typeahead/typeahead.css'
];

// Installation of the items in the array above
self.addEventListener('install', event => {
	// This is called in Chrome
	console.log('Service worker installed.');
	// Waits until all promises are completed before returning to the event handler.
	event.waitUntil(
		caches.open(cacheName)
			.then(cache => {
				return cache.addAll(resourcesToPrecache)
			})
	);
});

self.addEventListener('activate', event => {
	console.log('Service worker activated.');
});

self.addEventListener('fetch', event => {
	console.log('Fetch intercepted from from sw.js for:', event.request.url);
	event.respondWith(caches.match(event.request)
		.then(cachedResponse => {
			// If resource is already in cache, return. Else, get resource from internet.
			return cachedResponse || fetch(event.request);
		})
	);
});

// HTTP is fine if on localhost
// Otherwise, we NEED to be on HTTPS