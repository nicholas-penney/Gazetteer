/* Const */

const LOG10 = Math.log(10);

/*      Loading spinners    */

// Spinner queue
let spinnerQueue = {};

// Spinner: Page
function startPageSpinner() {
  const id = "spinner-page";
  startSpinner(id);
}
function stopPageSpinner() {
  const id = "spinner-page";
  stopSpinner(id);
}
// Spinner: Nav
function startNavSpinner() {
  const id = "spinner-nav";
  startSpinner(id);
}
function stopNavSpinner() {
  const id = "spinner-nav";
  stopSpinner(id);
}
// Spinner: Master
function startSpinner(id) {
  const div = document.getElementById(id);
  div.style.display = "flex";
}
function stopSpinner(id) {
  $("#" + id).fadeOut(400, function () {
    const div = document.getElementById(id);
    div.style.display = "none";
  });
}
// Remove preload spinner
$("#preload-spinner").fadeOut(1250, function () {
  $("#preload-spinner").remove();
});

/*      Setup       */

// Test localStorage
const storageIsAvailabile = isStorageAvailabile();

// localStorage ENUM
const storageKeys = {
  USERPOS: "userPos",
  HDEXPIRY: "hdOutlinesExpiryTimes",
  TOP10: "top10",
  COUNTRYNAMES: "countryNames",
  ISO2: "iso2",
  ISO2CURRENCIES: "iso2Currencies",
  CURRENCYCNS: "currencyCNS",
  QUARTILES: "quartiles",
  EXCHANGERATES: "exchangeRates",
};

class MapStore {
  // Leaflet obj
  appmap = null;
  // User's Coords object
  userPos = {
    lat: null,
    lng: null,
  };
  // Pointer/reference to current iso2 layer
  currentIsoLayer = null;
  // Flag for fetching location
  fetchCoordsFromNav = false;
  // Default zoom for map layer
  defaultZoom = 10;
  // Init from storage
  fetchedCoordsFromStorage = false;
  hdOutlinesExpiryTimes = {};
  // Var to track which HD outlines have already been fetched/updated to map
  hdOutlineAlreadyUpdated = {};
  // Var to track Tiny geoJSON layer LatLng Bounds and Centers
  tinyLatLngsBounds = {};
  tinyCenterLatLngs = {};
  // Bool for onEachFeature
  tinyCentersAreSet = false;
  // Var to hold features, to be used when fetching country from searchbar instead of click
  isoToFeature = {};
  // Var to hold layers, same as isoToFeature
  isoToLayer = {};
  // Var to hold Top10 objects
  isoToTop10Json = {};
  // Var to hold Popups to be fired on left-panel city click/hover
  top10PopUps = [];
  // Coordinates for initial load
  londonCoords = [51.5, -0.09];
  initCoords = this.londonCoords;
  updateInitCoords = () => {
    if (this.fetchedCoordsFromStorage) {
      this.initCoords = [this.userPos.lat, this.userPos.lng];
    }
  };
  // Map Style raster layers
  layersObj = {};
  // Map weather overlays layers
  overlaysObj = {};
  // Default layers e.g. street
  currentLayerName = "";
  currentOverlayName = "";
  // User position crosshair Marker
  userPosMarker = null;
  // FeatureGroup for each country
  geoJsonFeatureGroup = null;
  // Get Layer ID from ISO2
  layerIso2ToId = {};
  // Save Top10 marker layers to variable
  // { GB: layerGroup, FR: undefined, ... }
  iso2Top10Cities = {};
  // Top10 marker references
  currentCityMarkers = [];
}

class DataStore {
  // Wiki object store
  iso2ToWiki = {};
  // Weather object store
  iso2ToWeather = {};
  // Get currencies from ISO2
  iso2ToCurrencies = {};
  // Use currency code to get name and symbol (CNS)
  currencyCodeToNameAndSymbol = {};
  // Use currency code to get exchange history
  currencyCodeToExchangeHistory = {};
  // Var for quartiles, to be used in slider bars
  quartilesObj = {};
  // Var for iso2 populations
  iso2ToPopulation = {};
  // Country Names and ISO2 codes
  countryIsoArrays = {
    n: [],
    iso: [],
  };
}

class AppState {
  // Current country ISO2
  currentIso = "";
  // Previous search term
  previousUserSearch = "";
  // wiki: true, weather: undefined, financial: undefined, data: undefined
  tabDataLoaded = {};

  // Element menu control
  // Menu behaviour
  canShrinkMenu = true;
  menuLockedOpen = false;
  // Elements to target for menu open/close events
  menuElements = [
    $("#map-col"),
    $("#info-col"),
    $("#darken-map"),
    $("#info-tab"),
    $(".nav.nav-tabs")
  ];
  firstCountryNotYetLoaded = true;
}

// Init data stores
const mapStore = new MapStore();
const dataStore = new DataStore();
const appState = new AppState();

// Fetch setup from storage
if (storageIsAvailabile) {
  // Fetch user Coords from storage
  fetchUserCoordsFromStorage();
  mapStore.updateInitCoords();
  // Fetch HD outlines cache expiry times from storage
  initHdCacheExpiryFromStorage();
}

addSearchInputListener();
addTabListeners();

// Open menu
function menuExpand() {
  appState.menuElements.forEach((el) => {
    el.addClass("menu-open");
  });
}
// Close menu
function menuShrink() {
  if (appState.canShrinkMenu && !appState.menuLockedOpen) {
    appState.menuElements.forEach((el) => {
      el.removeClass("menu-open");
    });
  }
  return false;
}
addMenuListeners();

fetchNamesAndIsoJson();

/*      Leaflet & OpenStreetMap     */

// Layers
mapStore.layersObj = genLayersObj();
// Overlays
mapStore.overlaysObj = genOverlaysObj();

// Init map
mapStore.appmap = L.map("appmap").setView(
  mapStore.initCoords,
  mapStore.defaultZoom
);
initLayer();

// Feature group
mapStore.geoJsonFeatureGroup = L.geoJson().addTo(mapStore.appmap);

// Ghost Layers
addGhostLayers(L, mapStore.appmap);

// Map tile style buttons
addMenuLayerListeners();
// Settings menu
addSettingsIconListener();

// Fetch stored user Coords array
if (mapStore.fetchedCoordsFromStorage) {
  // Set marker
  const userLatLng = [mapStore.userPos.lat, mapStore.userPos.lng];
  initUserLocationIcon(userLatLng);
  setTimeout(() => {
    zoomToUser();
  }, 1500);
}

// User location crosshair icon
addUserLocationCrosshair();

// Get currencies
loadAllCurrencyData();

/*      Main      */

// Main method for PHP call
function loadCountryPhp(iso2, infoTypesArray) {
  // Add temp spinners while data loads
  const spinnerKey = "loadCountry";
  addSpinnerToQueue(spinnerKey);

  // Clear target containers, replace with loading spinners
  prepContainersFromArray(infoTypesArray);

  // Add smaller spinners for each section that is pending
  //if (infoTypesArray.includes('wiki')) createWikiPContainers();

  // Check if Financial is being requested, and add to request if any data is missing
  let currencyCode = null;
  if (infoTypesArray.includes("financial")) {
    // Also need population, and currency
    if (!dataStore.iso2ToPopulation[iso2]) {
      infoTypesArray.push("population");
    }
    if (dataStore.iso2ToCurrencies[iso2]) {
      const countryCurrencyObj = dataStore.iso2ToCurrencies[iso2];
      if (countryCurrencyObj) {
        if (countryCurrencyObj.code) {
          currencyCode = countryCurrencyObj.code;
          if (!dataStore.currencyCodeToExchangeHistory[currencyCode]) {
            // Fetch currency exchange rate, too
            infoTypesArray.push("currency:" + currencyCode);
          }
        }
      }
    }
  }

  // Generate URL
  const infoTypesString = infoTypesArray.join(",");
  const url = `/php/info/get.php?iso2=${iso2}&info=${infoTypesString}`;
  const spinnerKeyAjax = "loadCountryAjax";
  addSpinnerToQueue(spinnerKeyAjax);
  $.ajax({
    url: url,
    dataType: "json",
    success: function (data) {
      const dataString = JSON.stringify(data);
      if (!dataString) ajaxError();
      // Parse
      const parsed = JSON.parse(dataString);
      if (!parsed) ajaxError();
      ajaxSuccess(parsed);
    },
    error(error) {
      log("AJAX error getting PHP");
      log(error);
      ajaxError();
    },
  });

  // Remove relevant spinners (main if still there) and mini spinners
  removeSpinnerFromQueue(spinnerKey);

  /*  Methods */

  // Ajax
  function ajaxSuccess(response) {
    const data = response["data"];
    if (!data) {
      ajaxError();
      return;
    }
    // Population
    const populationData = data["population"];
    if (populationData) dataStore.iso2ToPopulation[iso2] = populationData;

    // Wiki
    const wiki = data["wiki"];
    if (wiki) handleAjaxWiki(wiki);

    // Weather
    const weather = data["weather"];
    if (weather) handleAjaxWeather(weather);

    // Financial
    const financial = data["financial"];
    if (financial) {
      if (data["currency"]) {
        const { currency } = data;
        if (currency.current) financial.current = currency.current;
        if (currency.days) financial.days = currency.days;
      }
      const population = dataStore.iso2ToPopulation[iso2] || null;
      financial.currencyCode = currencyCode;
      handleAjaxFinancial(financial, population);
    }

    // People
    const people = data["people"];
    if (people) {
      handleAjaxPeople(people);
    }

    ajaxUnload();
  }
  function ajaxError() {
    log("Ajax Error callback");
    ajaxUnload();
  }
  function ajaxUnload() {
    const spinnerKeyAjax = "loadCountryAjax";
    removeSpinnerFromQueue(spinnerKeyAjax);
    $('body').scrollTop();
  }

  // Wiki
  function handleAjaxWiki(wiki) {
    const entry = wiki[0];
    if (!entry) {
      return;
    }
    // Parse data
    const { sum } = entry;
    const wikiUrl = getWikiUrl();
    const thumbnailUrl = getThumbnailUrl();

    const wikiObj = { sum, wikiUrl, thumbnailUrl };
    dataStore.iso2ToWiki[iso2] = wikiObj;
    convertWikiObjToDom(wikiObj);
    /* Methods */
    function getWikiUrl() {
      const w_url = entry["w_url"];
      if (!w_url) return null;
      const prefix = "https://en.wikipedia.org/wiki/";
      const w_flag = entry["w_flag"];
      return w_flag ? w_url : prefix + w_url;
    }
    function getThumbnailUrl() {
      const t_url = entry["t_url"];
      if (!t_url) return null;
      const prefix = "https://www.geonames.org/img/wikipedia/";
      const t_flag = entry["t_flag"];
      return t_flag ? t_url : prefix + t_url;
    }
  }

  // Weather
  function handleAjaxWeather(weatherObj) {
    dataStore.iso2ToWeather[iso2] = weatherObj;
    convertWeatherObjToDom(weatherObj);
    appState.tabDataLoaded["weather"] = true;
  }

  // Financial
  function handleAjaxFinancial(phpData, population) {
    const parsedData = parseAndSaveExchangeData(phpData);
    parsedData.currencyCode = phpData.currencyCode;
    parsedData.population = population;
    parsedData.gdpMil = phpData.gdpMil;
    convertFinancialObjToDom(parsedData);
    appState.tabDataLoaded["financial"] = true;
  }

  // People
  function handleAjaxPeople(people) {
    const peoplePlusPopulation = { ...people };
    peoplePlusPopulation.population = dataStore.iso2ToPopulation[iso2];
    convertPeopleObjToDom(peoplePlusPopulation);
  }
}

// Use array to clear and insert spinners
function prepContainersFromArray(infoTypesArray) {
  const wikiIdObj = {
    mainId: "data-wiki",
    paraIds: ["wiki-wiki", "wiki-top10"],
  };
  const weatherIdObj = {
    mainId: "data-weather",
    paraIds: ["weather-current", "weather-hourly", "weather-daily"],
  };
  const financialIdObj = {
    mainId: "data-financial",
    paraIds: [
      "financial-currencies",
      "financial-exchange-rate",
      "financial-gdp",
    ],
  };
  const peopleIdObj = {
    mainId: "data-people",
    paraIds: [
      "people-general",
      "people-distribution",
      "people-wealth",
      "people-migration",
    ],
  };
  let targetIdObj = null;
  for (let i = 0; i < infoTypesArray.length; i++) {
    const infoType = infoTypesArray[i];
    switch (infoType) {
      case "wiki":
        targetIdObj = wikiIdObj;
        break;
      case "weather":
        targetIdObj = weatherIdObj;
        break;
      case "financial":
        resetFinancialPanel();
        break;
      case "people":
        targetIdObj = peopleIdObj;
        break;
    }
    if (targetIdObj === null) break;
  }
  if (targetIdObj !== null) _prepContainers(targetIdObj);
  /* Methods */
  // Clear containers, add divs and spinners
  function _prepContainers(targetIdObj) {
    const { mainId, paraIds } = targetIdObj;
    const $mainDiv = $(`#${mainId}`);
    clearColumn();
    createTargetContainers();
    // Clear container
    function clearColumn() {
      $mainDiv.empty();
    }
    // Add divs and insert spinners
    function createTargetContainers() {
      for (let i = 0; i < paraIds.length; i++) {
        const id = paraIds[i];
        const $loadingDivs = $(`<div id="${id}" class="loading"></div>`);
        const $spinnerContainer = $('<div class="spinner-container"></div>');
        const $spinner = $('<div class="spinner"></div>');

        $spinnerContainer.append($spinner);
        $loadingDivs.append($spinnerContainer);
        $mainDiv.append($loadingDivs);
      }
    }
  }
}

// Create empty Ps with spinners, ready to data to populate
function createWikiPContainers() {
  return;
  const $wikiDiv = $("#data-wiki");
  $wikiDiv.empty();
  const newParaIds = ["wiki-wiki", "wiki-top10"];
  for (let i = 0; i < newParaIds.length; i++) {
    const id = newParaIds[i];
    const $targetDiv = $(`<div id="${id}" class="loading"></div>`);
    const $spinnerContainer = $('<div class="spinner-container"></div>');
    const $spinner = $('<div class="spinner"></div>');

    $spinnerContainer.append($spinner);
    $targetDiv.append($spinnerContainer);
    $wikiDiv.append($targetDiv);
  }
}

/*      Wiki      */
// New country to load, wiki
function loadNewCountryWiki(iso2) {
  // Remove nav disabled class
  if (appState.firstCountryNotYetLoaded) { $('#tabs-list').removeClass('disabled'); delete appState.firstCountryNotYetLoaded }
  // Remove current country data
  resetInfoPanel();

  // Add temp spinners while data loads
  const spinnerKey = "loadNewCountryWiki";
  addSpinnerToQueue(spinnerKey);
  appState.canShrinkMenu = false;

  // Reset tabs
  appState.tabDataLoaded = {};
  tabToInfoSection("wiki");

  // Open Data pane (if not already open)
  lockStickyOpenMenu();
  menuExpand();

  // Change current iso2
  appState.currentIso = iso2;

  // Start Fetch any missing data
  // Cache data that arrives (if allowed)
  const wikiObj = dataStore.iso2ToWiki[iso2];
  if (wikiObj) {
    // Generate Ps
    prepContainersFromArray(['wiki']);
    // Generate from stored var
    convertWikiObjToDom(wikiObj);
  } else {
    const infoTypesArray = ["wiki"];
    loadCountryPhp(iso2, infoTypesArray);
  }

  removeSpinnerFromQueue(spinnerKey);

  /* Methods */
  // Clear current country, replace with spinners
  function resetInfoPanel() {
    const idNames = ["wiki", "weather", "financial", "people"];
    for (let i = 0; i < idNames.length; i++) {
      // Clear tab divs
      const selector = "#data-" + idNames[i];
      const $div = $(selector);
      $div.empty();
    }
  }
}
// Wiki to DOM
function convertWikiObjToDom(wikiObj) {
  const spinnerKey = "convertWikiToDom";
  addSpinnerToQueue(spinnerKey);
  const { sum, wikiUrl, thumbnailUrl } = wikiObj;
  // Generate Wiki-Short-Container, Wiki-Card, Wiki-Link
  const $wikiShortContainer = $('<div id="wiki-short-container"></div>');

  const $wikiCard = $('<div class="wiki-card"></div>');

  const $wikiImg = $(`<img src="${thumbnailUrl}"></img>`);
  const $wikiContents = $(`<span>${sum}</span>`);
  $wikiCard.append($wikiImg);
  $wikiCard.append($wikiContents);

  $wikiShortContainer.append($wikiCard);

  const $wikiLink = $(
    `<a href="${wikiUrl}" style="wiki-link" target="_blank">Wikipedia</a>`
  );
  $wikiShortContainer.append($wikiLink);

  const $title = $("<h5>Wiki</h5>");

  // Add to target
  const $target = $("div#wiki-wiki");
  $target.append($wikiShortContainer);
  // Remove spinner
  $target.children('div.spinner-container').remove();
  $target.prepend($title);
  $target.removeClass('loading');
  removeSpinnerFromQueue(spinnerKey);
  appState.tabDataLoaded["wiki"] = true;
}

/*      Weather   */
// Weather to DOM
function convertWeatherObjToDom(weatherObj) {
  addSpinnerToQueue("convertWeatherObjToDom");
  // Clear contents
  clearColumn();
  // Create empty <p>
  //createTargetContainers();
  prepContainersFromArray(['weather']);

  setDataToTargets();
  async function setDataToTargets() {
    // Current
    const sunrise = weatherObj.r || null;
    const sunset = weatherObj.s || null;
    if (weatherObj["c"]) {
      const currentObj = { ...weatherObj["c"] };
      currentObj.sunrise = sunrise;
      currentObj.sunset = sunset;
      convertCurrentToDom(currentObj);
    }

    // 24hr
    if (weatherObj["h"]) convertHourlyToDom(weatherObj.h);

    // 7 Days
    if (weatherObj["d"]) convertDailyToDom(weatherObj.d);

    removeSpinnerFromQueue("convertWeatherObjToDom");
  }

  /* Methods */
  function clearColumn() {
    const $div = $("#data-weather");
    $div.empty();
  }
  function createTargetContainers() {
    const $div = $("#data-weather");
    const newParaIds = ["weather-current", "weather-hourly", "weather-daily"];
    for (let i = 0; i < newParaIds.length; i++) {
      const id = newParaIds[i];
      const $loadingDivs = $(`<div id="${id}" class="loading"></div>`);
      const $spinnerContainer = $('<div class="spinner-container"></div>');
      const $spinner = $('<div class="spinner"></div>');

      $spinnerContainer.append($spinner);
      $loadingDivs.append($spinnerContainer);
      $div.append($loadingDivs);
    }
  }

  // Current
  function convertCurrentToDom(currentObj) {
    const { windSpeedMin, uviMin, rainMmHrMin, snowMmHrMin } =
      getWeatherRanges();
    const $targetDiv = $("#weather-current");

    const $heading = $("<h5>Current</h5>");

    const $row1 = $('<div class="current-rows"></div>');

    // Summary
    const $summary = $(`<div class="current-summary"></div>`);
    const $title = $(`<span class="summary-title">${currentObj.y.t}</span>`);
    const $icon = $(`<span class="summary-icon"></span>`);
    const $iconImg = weatherCodeToIcon(currentObj.y.c);
    $icon.append($iconImg);
    const feels = currentObj.t.f ? ` (${Math.round(currentObj.t.f)}°C)` : null;
    const $feels = $(`<span class="temp-feels-light">${feels}</span>`);
    const $temperature = $(`<span class="summary-temperature">${Math.round(
      currentObj.t.t
    )}°C&nbsp;</
    span>`);
    $temperature.append($feels);
    $summary.append($title);
    $summary.append($icon);
    $summary.append($temperature);
    $row1.append($summary);

    // Wind
    const $wind = $(`<div class="current-wind"></div>`);
    if (currentObj.w.s || currentObj.w.s === 0) {
      // Has wind speed
      const speed = currentObj.w.s ? currentObj.w.s : 0;
      // SpeedText
      const $speedText = windSpeedToText(speed, windSpeedMin);
      $wind.append($speedText);
      // Arrow
      // New arrow factory
      const deg = currentObj.w.d || 0;
      const $arrow = generate$WindArrow(deg, speed);

      $wind.append($arrow);
      // Speed int
      if (speed) {
        const $speed = $(`<span class="wind-speed-int">${speed}m/s</span>`);
        $wind.append($speed);
      }
    }
    $row1.append($wind);

    // To screen
    $targetDiv.append($row1);

    let showUvRainVis = false;
    const $uvRainVis = $(`<table></table>`);
    const $tbody = $(`<tbody></tbody>`);

    // Clouds
    if (currentObj.c || currentObj.c >= 0) {
      showUvRainVis = true;
      const clouds = currentObj.c;
      const $tr = $(`<tr></tr>`);
      const $left = $(`<td>Clouds:</td>`);
      const $right = $(`<td>${clouds}%</td>`);
      $tr.append([$left, $right]);
      $tbody.append($tr);
    }
    // UVI
    if (currentObj.u || currentObj.u >= 0) {
      showUvRainVis = true;
      const uvi = currentObj.u;
      const uviText = currentValToText(uvi, uviMin);
      if (uviText) {
        const $tr = $(`<tr></tr>`);
        const $left = $(`<td>UV Index:</td>`);
        const $right = $(`<td>${uvi} (${uviText})</td>`);
        $tr.append([$left, $right]);
        $tbody.append($tr);
      }
    }
    // Humidity
    if (currentObj.h || currentObj.h >= 0) {
      showUvRainVis = true;
      const humidity = currentObj.h;
      const $tr = $(`<tr></tr>`);
      const $left = $(`<td>Humidity:</td>`);
      const $right = $(`<td>${humidity}%</td>`);
      $tr.append([$left, $right]);
      $tbody.append($tr);
    }
    // Rain
    if (currentObj.r || currentObj.r >= 0) {
      showUvRainVis = true;
      const rain = currentObj.r;
      const rainText = currentValToText(rain, rainMmHrMin);
      if (rainText) {
        const $tr = $(`<tr></tr>`);
        const $left = $(`<td>Rain:</td>`);
        const $right = $(`<td>${rain}mm/hr (${rainText})</td>`);
        $tr.append([$left, $right]);
        $tbody.append($tr);
      }
    }
    // Snow
    if (currentObj.s || currentObj.s >= 0) {
      showUvRainVis = true;
      const snow = currentObj.s;
      const snowText = currentValToText(snow, snowMmHrMin);
      if (snowText) {
        const $tr = $(`<tr></tr>`);
        const $left = $(`<td>Snow:</td>`);
        const $right = $(`<td>${snow}mm/hr (${snowText})</td>`);
        $tr.append([$left, $right]);
        $tbody.append($tr);
      }
    }
    // Visibility
    if (currentObj.v || currentObj.v >= 0) {
      showUvRainVis = true;
      const vis = currentObj.v;
      const $tr = $(`<tr></tr>`);
      const $left = $(`<td>Visibility:</td>`);
      const $right = $(`<td>${numberWithCommas(vis)}m</td>`);
      $tr.append([$left, $right]);
      $tbody.append($tr);
    }
    // Pressure
    if (currentObj.p || currentObj.p >= 0) {
      showUvRainVis = true;
      const pressure = currentObj.p;
      const $tr = $(`<tr></tr>`);
      const $left = $(`<td>Pressure:</td>`);
      const $right = $(
        `<td>${numberWithCommas(Math.round(pressure / 10))} kPa</td>`
      );
      $tr.append([$left, $right]);
      $tbody.append($tr);
    }

    const $row2 = $('<div class="current-rows d-flex"></div>');
    if (showUvRainVis) {
      $uvRainVis.append($tbody);
      $row2.append($uvRainVis);
    }

    // Sunrise / Sunset
    if (currentObj.sunrise && currentObj.sunset) {
      const { sunrise, sunset } = currentObj;
      const $sunriseSunset = $(
        `<div class="current-sun d-flex flex-column align-items-center"></div>`
      );
      const sunriseText = convertMinuteToTimeString(sunrise);
      const sunsetText = convertMinuteToTimeString(sunset);
      // Elements
      const $sunriseImg = weatherCodeToIcon("sr");
      const $sunriseText = $(`<span>${sunriseText}</span>`);
      const $sunsetImg = weatherCodeToIcon("ss");
      const $sunsetText = $(`<span>${sunsetText}</span>`);
      $sunriseSunset.append([
        $sunriseImg,
        $sunriseText,
        $sunsetImg,
        $sunsetText,
      ]);

      $row2.append($sunriseSunset);
    }
    $targetDiv.append($("<hr></hr>"));
    $targetDiv.append($row2);

    $targetDiv.prepend($heading);
    $targetDiv.children('.spinner-container').remove();
    $targetDiv.removeClass('loading');
  }

  // Hourly
  function convertHourlyToDom(hourlyObjs) {
    addSpinnerToQueue("convertHourlyToDom");
    let shouldDisplay = { hour: true };
    const columnOrder = [
      "hour",
      "icon",
      "probOfP",
      "rain",
      "snow",
      "temp",
      "feels",
      "windDeg",
      "windSpeed",
      "uvi",
    ];
    const rowTitle = [
      "",
      "",
      "Rain (%)",
      "Rain",
      "Snow",
      "°C",
      "(Feels)",
      "",
      "Wind (m/s)",
      "UVI",
    ];

    const hourlyObjsLen = hourlyObjs.length;
    let hours = [];
    for (let i = 0; i < hourlyObjsLen; i++) {
      const hourlyObj = hourlyObjs[i];
      let hourObj = {};
      const hour = hourlyObj["x"] || null;
      hourObj.hour = hour;
      const summary = hourlyObj["y"] || null;
      if (summary) {
        const iconCode = summary["c"] || null;
        if (iconCode) {
          const icon = weatherCodeToIcon(iconCode);
          hourObj.icon = icon;
          shouldDisplay.icon = true;
        }
      }
      const probOfP = hourlyObj["o"] || null;
      if (probOfP) {
        hourObj.probOfP = Math.round(probOfP*100);
        shouldDisplay.probOfP = true;
      }
      const rain = Math.round(hourlyObj["r"]) || null;
      if (rain) {
        hourObj.rain = rain;
        shouldDisplay.rain = true;
      }
      const snow = Math.round(hourlyObj["s"]) || null;
      if (snow) {
        hourObj.snow = snow;
        shouldDisplay.snow = true;
      }
      const temps = hourlyObj["t"] || null;
      if (temps) {
        const temp = Math.round(temps["t"]) || null;
        if (temp) {
          hourObj.temp = temp;
          shouldDisplay.temp = true;
        }
        const feels = Math.round(temps["f"]) || null;
        if (feels) {
          hourObj.feels = feels;
          if (feels !== temp) {
            shouldDisplay.feels = true;
          }
        }
      }
      const wind = hourlyObj["w"] || null;
      if (wind) {
        const windSpeed = Math.round(wind["s"]) || null;
        const windDeg = wind["d"] || null;
        if (windSpeed && windDeg !== null) {
          hourObj.windDeg = windDeg;
          shouldDisplay.windDeg = true;
          shouldDisplay.windSpeed = true;
          hourObj.windSpeed = windSpeed;
        }
      }
      const uvi = hourlyObj["u"] || null;
      if (uvi) {
        hourObj.uvi = uvi;
        shouldDisplay.uvi = true;
      }
      hours.push(hourObj);
    }
    // Looped through each hour

    // Pass hours etc to table factory method
    const $divScrollTable = generateWeatherTable(
      columnOrder,
      rowTitle,
      shouldDisplay,
      hours
    );

    const $targetDiv = $("#weather-hourly");
    const $title = $("<h5>Hourly Forecast</h5>");
    $targetDiv.append($divScrollTable);
    // Add title, remove spinner
    $targetDiv.children('.spinner-container').remove();
    $targetDiv.prepend($title);
    $targetDiv.removeClass('loading');
    removeSpinnerFromQueue("convertHourlyToDom");
  }

  // Daily
  function convertDailyToDom(dailyObjs) {
    addSpinnerToQueue("convertDailyToDom");

    let shouldDisplay = { dayOfWeek: true };
    const columnOrder = [
      "dayOfWeek",
      "icon",
      "probOfP",
      "rain",
      "snow",
      "tMax",
      "tMin",
      "windDeg",
      "windSpeed",
      "uvi",
    ];
    const rowTitle = [
      "",
      "",
      "Rain (%)",
      "Rain",
      "Snow",
      "Max °C",
      "Min °C",
      "",
      "Wind (m/s)",
      "UVI",
    ];

    const dailyObjsLen = dailyObjs.length;
    let entries = [];
    // Loop through each day
    for (let i = 0; i < dailyObjsLen; i++) {
      const dailyObj = dailyObjs[i];
      let entry = {};
      const dayOfWeek = dailyObj["x"]
        ? getDayOfWeekFromUnixDay(dailyObj["x"])
        : null;
      entry.dayOfWeek = dayOfWeek;
      const summary = dailyObj["y"] || null;
      if (summary) {
        const iconCode = summary["c"] || null;
        if (iconCode) {
          const icon = weatherCodeToIcon(iconCode);
          entry.icon = icon;
          shouldDisplay.icon = true;
        }
      }
      const probOfP = dailyObj["o"] || null;
      if (probOfP) {
        entry.probOfP = `${Math.round(probOfP*100)}`;
        shouldDisplay.probOfP = true;
      }
      const rain = dailyObj["r"] ? Math.round(dailyObj["r"]) : null;
      if (rain) {
        entry.rain = rain;
        shouldDisplay.rain = true;
      }
      const snow = dailyObj["s"] ? Math.round(dailyObj["s"]) : null;
      if (snow) {
        entry.snow = snow;
        shouldDisplay.snow = true;
      }
      const temps = dailyObj["t"] || null;
      if (temps) {
        const tMax = temps["h"] ? Math.round(temps["h"]) : null;
        if (tMax) {
          entry.tMax = tMax;
          shouldDisplay.tMax = true;
        }
        const tMin = temps["l"] ? Math.round(temps["l"]) : null;
        if (tMin) {
          entry.tMin = tMin;
          if (tMin !== tMax) {
            shouldDisplay.tMin = true;
          }
        }
      }
      const wind = dailyObj["w"] || null;
      if (wind) {
        const windSpeed = wind["s"] ? Math.round(wind["s"]) : null;
        const windDeg = wind["d"] || null;
        if (windSpeed && windDeg !== null) {
          entry.windDeg = windDeg;
          shouldDisplay.windDeg = true;
          shouldDisplay.windSpeed = true;
          entry.windSpeed = windSpeed;
        }
      }
      const uvi = dailyObj["u"] || null;
      if (uvi) {
        entry.uvi = uvi;
        shouldDisplay.uvi = true;
      }
      entries.push(entry);
    }
    // Looped through each day

    // Pass days to table factory method
    const $divScrollTable = generateWeatherTable(
      columnOrder,
      rowTitle,
      shouldDisplay,
      entries
    );

    const $targetDiv = $("#weather-daily");
    const $title = $("<h5>Daily Forecast</h5>");

    const $centreDiv = $("<div></div>");
    $centreDiv.addClass("d-flex justify-content-center");
    $centreDiv.append($divScrollTable);
    $targetDiv.append($centreDiv);

    // Add title, remove spinner
    $targetDiv.children('.spinner-container').remove();
    $targetDiv.prepend($title);
    $targetDiv.removeClass('loading');

    removeSpinnerFromQueue("convertDailyToDom");

    /* Methods */
    function getDayOfWeekFromUnixDay(unixDay) {
      const timestamp = unixDay * 86400 + 0;
      const d = new Date(timestamp * 1000);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayOfWeek = days[d.getDay()];
      return dayOfWeek;
    }
  }

  // Factory for generating weather table for Hourly and Daily
  function generateWeatherTable(
    rowOrders,
    rowTitles,
    shouldDisplayRefObj,
    entryObjects
  ) {
    const $tbody = $("<tbody></tbody>");
    // Loop down rows
    for (let i = 0; i < rowOrders.length; i++) {
      const rowKey = rowOrders[i];
      // Skip row entirely?
      if (!shouldDisplayRefObj[rowKey]) continue;
      // Row
      const $tr = $("<tr></tr>");
      const $leftCol = $("<th></th>");
      let leftColText = rowTitles[i];
      // Feels, not-bold
      if (rowKey === "feels") {
        $tr.addClass("temp-feels-light");
      }
      // Wind, rowspan 2
      if (rowKey === "windDeg") {
        // colspan should be 2x cells, for wind deg + speed
        $leftCol.attr("rowspan", "2");
        leftColText = rowTitles[i + 1];
      }
      $leftCol.append(leftColText);
      // Divider for certain sections
      const rowsToDivide = ["rain", "windDeg", "tMax", "uvi"];
      if (rowsToDivide.includes(rowKey)) $tr.addClass("divide-top");
      // Add left "title" cell to table row
      if (rowKey !== "windSpeed") $tr.append($leftCol);
      // Add each hour cell to table
      for (let j = 0; j < entryObjects.length; j++) {
        // Skip windspeed, already handled by windDeg
        if (rowKey === "windSpeed") continue;
        const entry = entryObjects[j];
        // Deal with time/hour being 24 || null => 0
        let data = rowKey === "hour" ? entry[rowKey] || 0 : entry[rowKey];
        const $td = $(`<td></td>`);
        // Feels
        if (rowKey === "feels") {
          const temp = entry["temp"];
          const feels = entry["feels"];
          if (temp === feels) {
            // Same data, keep UI clean: don't show
            data = "";
          }
        }
        // UVI
        if (rowKey === "uvi") {
          data = Math.round(data);
          if (!data) {
            // ghost-cell
            $td.addClass("ghost-cell");
            data = "0";
            continue;
          }
        }
        // Wind
        if (rowKey === "windDeg") {
          // If windDeg, Gen Arrow/Speed
          const speed = entry["windSpeed"] || 0;
          if (speed) {
            const $arrow = generate$WindArrow(data, speed);
            const $speed = $(`<span>${speed}<span>`);
            $td.append([$arrow, $speed]);
          }
          $tr.append($td);
          continue;
        }
        $td.append(data);
        // Deal with Probability of Precip
        if (rowKey === "probOfP") {
          if (data) {
            const $percentSymbol = $("<span>%</span>");
            // Opacity between 0.5->1.0
            const divider = 1.75;
            const floorBoost = (divider-1)/divider;
            const cellOpacity = (data/100/divider)+floorBoost;
            // Also dim symbol
            const symbolDivider = 1.5;
            const symbolFloorBoost = (symbolDivider-1)/symbolDivider/2;
            const symbolOpacity = (data/100/symbolDivider)+symbolFloorBoost;
            $percentSymbol.css('opacity', symbolOpacity);
            
            $td.css('opacity', cellOpacity);
            $td.append($percentSymbol);
          }
        }
        // Temp? Add degree
        const tempHaystack = ["temp", "feels", "tMax", "tMin"];
        if (tempHaystack.includes(rowKey) && data !== "" && data !== null && data !== undefined) {
          const $degreeSymbol = $("<span>°</span>");
          $degreeSymbol.addClass("ghost-units");
          $td.append($degreeSymbol);
        }
        // Rain/Snow? Add mm
        const rainSnowHaystack = ["rain", "snow"];
        if (
          rainSnowHaystack.includes(rowKey) &&
          data !== 0 &&
          data !== null &&
          data !== "" &&
          data !== undefined
        ) {
          const $units = $("<span>mm</span>");
          $units.addClass("ghost-units ghost-units-sm");
          $td.append($units);
        }
        $tr.append($td);
      }
      // End of row, add row to tbody
      $tbody.append($tr);
    }
    // End of tbody, add tbody to table
    const $table = $("<table></table>");
    $table.append($tbody);
    // Add table to paragraph
    const $divScroll = $("<div></div>");
    $divScroll.addClass("table-scroll-container");
    $divScroll.append($table);
    return $divScroll;
  }

  function generate$WindArrow(windDeg, speed) {
    const $arrow = weatherCodeToIcon("ar");
    if (windDeg) $arrow.css("transform", `rotate(${windDeg}deg)`);
    let arrowOpacity = 1;
    if (speed < 30) arrowOpacity = 0.75;
    if (speed < 20) arrowOpacity = 0.5;
    if (speed < 10) arrowOpacity = 0.25;
    $arrow.css("opacity", arrowOpacity);
    return $arrow;
  }

  // Weather code to Img Icon
  function weatherCodeToIcon(code) {
    if (code.length < 2) return null;
    const code2 = code.substring(0, 2);
    let c = "";
    switch (code2) {
      case "01":
        c = "sunny";
        break;
      case "02":
        c = "cloud cloud-light";
        break;
      case "03":
        c = "cloud";
        break;
      case "04":
        c = "cloud cloud-heavy";
        break;
      case "09":
        c = "rain";
        break;
      case "10":
        c = "rain-heavy";
        break;
      case "11":
        c = "lightning";
        break;
      case "13":
        c = "snow";
        break;
      case "50":
        c = "snow";
        break;
      case "wi":
        c = "wind";
        break;
      case "ar":
        c = "wind-arrow";
        break;
      case "sr":
        c = "sunrise";
        break;
      case "ss":
        c = "sunset";
        break;
    }
    const $icon = $(`<img class="${c}"></img>`);
    return $icon;
  }
  // Wind Speed to English
  function windSpeedToText(speed, windSpeedMin) {
    const windSpeedMinLen = windSpeedMin.length;
    let text = "N/A";
    for (let i = 0; i < windSpeedMinLen; i++) {
      for (const [k, v] of Object.entries(windSpeedMin[i])) {
        if (speed > k) text = v;
      }
    }
    return $(`<span class="wind-speed-text">${text}</span>`);
  }
  // Current wather value to text
  function currentValToText(val, minObjs) {
    const minObjsLen = minObjs.length;
    for (let i = 0; i < minObjsLen; i++) {
      const [k, v] = Object.entries(minObjs[i])[0];
      if (val >= k) return v;
    }
    return null;
  }
}

/*      Financial   */
// Financial to DOM
function convertFinancialObjToDom(financialObj) {
  // spinner
  const spinnerKey = "loadCountryFinancialTab";
  addSpinnerToQueue(spinnerKey);
  // Reset tab
  //resetFinancialPanel();

  /**
   * Data required :-
   *
   * Currency:
   *   Currency symbol : £
   *   Currency Code : GBP
   *   Currency denomination : Pound
   *
   * Exchange rate:
   *   Current/latest exchange rate
   *   Past 7 days history
   *
   * GDP:
   *   GDP in $
   *   (GDP & Population) = GDP per capita in $
   *
   */

  /**
   * financialObj: {
      gdpMil,
      currencyCode,
      population,
      otherCurrencyCodes,
      exchangeData: {
        current: {
          rate,
          timestamp,
          timestampString
        },
        max,
        min,
        [days]
        [unixDays]
      }
   * }
   */

  // Populate Ps with data

  // Quartiles
  const { gdp, gdpcap } = dataStore.quartilesObj;

  const currencyCode = financialObj.currencyCode || "";
  let denomination = "";
  let currencySymbol = "";

  // Currencies
  if (currencyCode) {
    // Primary
    const $targetDiv = $("#financial-currencies");
    const $title = $("<h5>Currencies</h5>");

    // Symbol
    // Code
    // Denomination
    // Get other data using code
    const cns = dataStore.currencyCodeToNameAndSymbol[currencyCode] || ["", ""];
    denomination = cns[0] ? ` (${cns[0]})` : "";
    currencySymbol = cns[1] ? cns[1] + " " : "";

    const $currencyRow = $("<p></p>");
    const $currencyKey = $(`<span>Primary currency:</span>`);
    $currencyKey.addClass("data-key");
    const $currencyVal = $(
      `<span>${currencySymbol}${currencyCode}${denomination}</span>`
    );
    $currencyRow.append([$currencyKey, $currencyVal]);
    $targetDiv.append($currencyRow);

    if (financialObj.otherCurrencyCodes !== undefined) {
      // Other currencies
      const { otherCurrencyCodes } = financialObj;
      // Key
      const $otherCurrenciesRow = $("<p></p>");
      const $currenciesKey = $(`<span>Other currencies:</span>`);
      $currenciesKey.addClass("data-key");
      // Val
      const currenciesText = otherCurrencyCodes.replace(/,/g, ", ");
      const $currenciesText = $(`<span>${currenciesText}</span>`);
      $otherCurrenciesRow.append([$currenciesKey, $currenciesText]);
      $targetDiv.append($otherCurrenciesRow);
    }

    $targetDiv.children('.spinner-container').remove();
    $targetDiv.prepend($title);
    $targetDiv.removeClass('loading');
  }

  // Exchange rate
  if (
    financialObj.current &&
    financialObj.days &&
    financialObj.max !== undefined &&
    financialObj.min !== undefined
  ) {
    /**
     *current: {
        rate: currentRate,
        timestamp: currentTimestampSec,
        timestampString: currentTimestampFormatted
      },
      max,
      min,
      days: times,
      unixDays
    */
    const $targetDiv = $("#financial-exchange-rate");
    const $title = $("<h5>Exchange Rate</h5>");

    const { current } = financialObj;
    const currentRate =
      current.rate < 0.001 ? current.rate.toFixed(5) : current.rate.toFixed(3);
    const { timestampString } = current;
    const symbolTrim = currencySymbol.trim();
    const currencySpan =
      '<bdo class="currency-symbol">' + symbolTrim + "</bdo>";
    const jQueryString = `<p><span class="data-key">Current:</span> ${currencySpan}1 = $${currentRate} <span class="ghost">(USD) @ ${timestampString}</span></p>`;
    const $current = $(jQueryString);
    if (current.rate < 0.5) {
      // Small denominations
      const inverted = 1 / current.rate;
      const numToDisplay =
        inverted >= 1000
          ? numberWithCommas(Math.round(inverted))
          : inverted.toFixed(2);
      const $inverted = $(
        `<p class="ghost-6"><b>Inverted:</b> $1 = ${currencySpan}${numToDisplay}</p>`
      );
      $targetDiv.prepend($inverted);
    }
    $targetDiv.prepend($current);

    var ctx = document.getElementById("chart").getContext("2d");
    ctx.canvas.width = "100%";
    ctx.canvas.height = "100%";

    const label = currencyCode || "";
    const { days, max, min } = financialObj;
    // Generate y buffer
    const yRange = max - min;
    const yRange5pc = yRange * 0.05;
    let roundMulti = 1;
    if (min > 0.1) {
      roundMulti = 10000;
    } else if (min > 0.01) {
      roundMulti = 100000;
    } else {
      roundMulti = 1000000;
    }
    const yMin = Math.floor((min - yRange5pc) * roundMulti) / roundMulti;
    const yMax = Math.ceil((max + yRange5pc) * roundMulti) / roundMulti;

    const chartType = "candlestick";
    const chartData = {
      datasets: [
        {
          label,
          data: days,
        },
      ],
    };
    const chartOptions = {
      legend: {
        display: false,
      },
      scales: {
        y: {
          min: yMin,
          max: yMax,
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              return ctxToLabel(ctx);
            },
          },
        },
      },
    };

    const chart = new Chart(ctx, {
      type: chartType,
      data: chartData,
      options: chartOptions,
    });

    $targetDiv.children('.spinner-container').remove();
    $targetDiv.prepend($title);
    $targetDiv.removeClass('loading');

    /* Methods  */
    function ctxToLabel(ctx) {
      const { dataPoint } = ctx;
      let { o, h, l, c } = dataPoint;
      if (l > 100) {
        // Large denomination
        o = Math.round(o);
        h = Math.round(h);
        l = Math.round(l);
        c = Math.round(c);
      } else if (l > 0.001) {
        // Normal exchange rate
        o = _fix(o);
        h = _fix(h);
        l = _fix(l);
        c = _fix(c);
      } else {
        // Tiny denomination
      }
      return `O: ${o}  Lo: ${h}  Hi: ${l}  C: ${c}`;
      function _fix(fl) {
        return fl.toFixed(getFixedInt(fl) + 3);
      }
      function getFixedInt(rate) {
        const nLog = Math.log(rate) / LOG10;
        const nLogAbs = Math.abs(nLog);
        const nLogAbsRound = Math.round(nLogAbs);
        return nLogAbsRound;
      }
    }
  }

  // GDP
  if (financialObj.gdpMil !== undefined) {
    // GDP, nominal
    const $targetDiv = $("#financial-gdp");
    const $title = $("<h5>GDP</h5>");

    // Key
    const $dataKey = $(`<span>GDP:</span>`);
    $dataKey.addClass("data-key");

    // Val
    // Check if value is small
    const { gdpMil } = financialObj;
    let $dataVal = null;
    if (gdpMil < gdp.lower) {
      const gdpMilMultiplied = numberWithCommas(gdpMil * gdp.multiplier);
      $dataVal = $(
        `<span>$ ${gdpMilMultiplied} <span class="ghost-units">(USD)</span></span>`
      );
    } else {
      $dataVal = $(
        `<span>$ ${numberWithCommas(
          gdpMil
        )}m <span class="ghost-units">(USD)</span></span>`
      );
    }
    $dataKey.addClass("data-key");
    const $gdpRow = $("<p></p>");
    $gdpRow.append([$dataKey, $dataVal]);
    $targetDiv.append($gdpRow);

    const $gdpSlider = gen$DataSlider(gdpMil, gdp);
    $targetDiv.append($gdpSlider);

    // GDP, per capita
    if (financialObj.population) {
      $targetDiv.append($("<hr></hr>"));

      const $gdpCapKey = $(`<span>GDP/capita:</span>`);
      $gdpCapKey.addClass("data-key");
      const countryPopulation = financialObj.population;
      const countryGdpPerCapita = Math.round(
        (gdpMil * gdp.multiplier) / countryPopulation
      );

      const $gdpCapVal = $(
        `<span>$ ${numberWithCommas(
          countryGdpPerCapita
        )} <span class="ghost-units">(USD)</span></span>`
      );

      const $gdpRow = $("<p></p>");
      $gdpRow.append([$gdpCapKey, $gdpCapVal]);
      $targetDiv.append($gdpRow);

      const $gdpCapSlider = gen$DataSlider(countryGdpPerCapita, gdpcap);
      $targetDiv.append($gdpCapSlider);
    }

    $targetDiv.children('.spinner-container').remove();
    $targetDiv.prepend($title);
    $targetDiv.removeClass('loading');
  }

  unloadFinancial();

  /* Methods */
  function unloadFinancial() {
    removeSpinnerFromQueue(spinnerKey);
  }
}
function resetFinancialPanel() {
  // Clear div
  const idName = "financial";
  const selector = "#data-" + idName;
  const $div = $(selector);
  $div.empty();
  createFinancialPContainers();

  const $exchangeRate = $("#financial-exchange-rate");
  const $chartContainer = $(
    '<div style="width:100%;height:300px;background-color:#fafafa;margin:1.5rem 0;"></div>'
  );
  const $chart = $('<canvas id="chart"></canvas>');
  $chartContainer.append($chart);
  $exchangeRate.append($chartContainer);

  // Make Ps
  function createFinancialPContainers() {
    const $financialDiv = $("#data-financial");
    $financialDiv.empty();
    const newParaIds = [
      "financial-currencies",
      "financial-exchange-rate",
      "financial-gdp",
    ];
    for (let i = 0; i < newParaIds.length; i++) {
      const id = newParaIds[i];
      const $targetDiv = $(`<div id="${id}" class="loading"></div>`);
      const $spinnerContainer = $('<div class="spinner-container"></div>');
      const $spinner = $('<div class="spinner"></div>');

      $spinnerContainer.append($spinner);
      $targetDiv.append($spinnerContainer);
      $financialDiv.append($targetDiv);
    }
  }
}
function parseAndSaveExchangeData(rawPhpData) {
  const { currencyCode } = rawPhpData;
  // Current
  const { current } = rawPhpData;
  const currentRate = 1 / current.r;
  const currentTimestampSec = current.t;
  const currentTimestampSecInToday = currentTimestampSec % 86400;
  const currentTimestampMinutesInToday = Math.floor(
    currentTimestampSecInToday / 60
  );
  const currentTimestampFormatted = convertMinuteToTimeString(
    currentTimestampMinutesInToday
  );

  // Days
  const days = rawPhpData.days;
  let times = [];
  let unixDays = [];
  let min = null;
  let max = null;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    let { t, l, o, c, h } = day;
    l = _fix(l);
    o = _fix(o);
    c = _fix(c);
    h = _fix(h);
    unixDays.push(t);
    const rateArray = [l, o, c, h];
    const smallest = Math.min(...rateArray);
    const largest = Math.max(...rateArray);
    if (min === null || min > smallest) min = smallest;
    if (max === null || max < largest) max = largest;
    const unix = t * 86400;
    const luxDate = luxon.DateTime.fromSeconds(unix).valueOf();
    const rtnDay = { t: luxDate, l, o, c, h };
    times.push(rtnDay);
  }

  const returnObj = {
    current: {
      rate: currentRate,
      timestamp: currentTimestampSec,
      timestampString: currentTimestampFormatted,
    },
    max,
    min,
    days: times,
    unixDays,
  };

  const storageKey = storageKeys.EXCHANGERATES;
  const storageObj = fetchAndParseFromStorage(storageKey) || {};
  const unixNow = getUnixNow();
  storageObj[currencyCode] = { t: unixNow, data: returnObj };
  saveObjToStorage(storageKey, storageObj);

  return returnObj;

  /* Methods*/
  function _fix(fl) {
    return 1 / fl;
  }
}

/*      People      */
function convertPeopleObjToDom(people) {
  // Unpack
  const {
    ageMedian,
    areaKm,
    callingCode,
    currencyCode,
    flagUrl,
    gdpMil,
    languagesCsv,
    migrantsNet,
    urbanPc,
    population,
  } = people;

  // Gen target P / Div containers
  createPeoplePContainers();

  // Add data to targets

  // GENERAL
  let generalSuccess = false;
  const $peopleGeneral = $("#people-general");
  if ($peopleGeneral) {
    const $title = $("<h5>General</h5>");

    // Flag
    if (flagUrl) {
      const $p = $("<p></p>");
      // Key
      const $dataKey = $(`<span>Flag:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $("<span><span>");
      const $svg = $(`<img src="https://flagcdn.com/${flagUrl.substr(0, 2)}.svg" class="flagSvg"></img>`);
      $val.append($svg);
      $p.append([$dataKey, $val]);
      $peopleGeneral.append($p);
      generalSuccess = true;
    }

    // Languages
    if (languagesCsv) {
      const $p = $("<p></p>");
      const languages = languagesCsv.replace(/,/g, ", ");
      // Key
      const $dataKey = $(`<span>Languages:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $("<span><span>");
      $val.append(languages);
      $p.append([$dataKey, $val]);
      $peopleGeneral.append($p);
      generalSuccess = true;
    }

    // Calling code
    if (callingCode) {
      const $p = $("<p></p>");
      // Key
      const $dataKey = $(`<span>Calling code:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(`<span>+${callingCode}<span>`);
      $p.append([$dataKey, $val]);
      $peopleGeneral.append($p);
      generalSuccess = true;
    }

    // Pop Density
    if (population) {
      const $p = $("<p></p>");
      // Key
      const $dataKey = $(`<span>Population:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(
        `<span>${numberWithCommas(population)}<span>`
      );
      // Slider
      const populationQ = dataStore.quartilesObj.population;
      const $slider = gen$DataSlider(population, populationQ);
      $p.append([$dataKey, $val, $slider]);
      $peopleGeneral.append($p);
      generalSuccess = true;
    }

    // Area
    if (areaKm) {
      const $p = $("<p></p>");
      // Quartile
      const areaQ = dataStore.quartilesObj.area;
      // Key
      const $dataKey = $(`<span>Area:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(`<span>${numberWithCommas(areaKm)} km2<span>`);
      // Slider
      const $slider = gen$DataSlider(areaKm, areaQ);
      $p.append([$dataKey, $val, $slider]);
      $peopleGeneral.append($p);
      generalSuccess = true;
    }

    // Pop Density
    if (population) {
      const populationThouPerSq = Math.round(population / areaKm);
      const $p = $("<p></p>");
      // Key
      const $dataKey = $(`<span>Population density:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(
        `<span>${numberWithCommas(populationThouPerSq)} /km2<span>`
      );
      // Slider
      const densityQ = dataStore.quartilesObj.density;
      const $slider = gen$DataSlider(populationThouPerSq, densityQ);
      $p.append([$dataKey, $val, $slider]);
      $peopleGeneral.append($p);
      generalSuccess = true;
    }

    // Remove spinner
    $peopleGeneral.children('div.spinner-container').remove();
    $peopleGeneral.prepend($title);
    $peopleGeneral.removeClass('loading');
    // check if not countrySuccess, replace with "Error" message
    if (!generalSuccess) log("People-General: no data");
  }

  // DISTRIBUTION
  let distributionSuccess = false;
  const $peopleDistribution = $("#people-distribution");
  if ($peopleDistribution) {
    const $title = $("<h5>Distribution</h5>");
    //pop-density/area

    // Age
    if (ageMedian) {
      const $p = $("<p></p>");
      // Key
      const $dataKey = $(`<span>Median age:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(`<span>${ageMedian} years old<span>`);
      // Slider
      const ageQ = dataStore.quartilesObj.age;
      const $slider = gen$DataSlider(ageMedian, ageQ);
      $p.append([$dataKey, $val, $slider]);
      $peopleDistribution.append($p);
      distributionSuccess = true;
    }

    // Urban
    if (urbanPc) {
      const $p = $("<p></p>");
      // Key
      const $dataKey = $(`<span>Urban dwelling:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(`<span>${urbanPc}%<span>`);
      // Slider
      const urbanQ = dataStore.quartilesObj.urbanPc;
      const $slider = gen$DataSlider(urbanPc, urbanQ);
      $p.append([$dataKey, $val, $slider]);
      $peopleDistribution.append($p);
      distributionSuccess = true;
    }

    // Remove spinner
    $peopleDistribution.children('div.spinner-container').remove();
    $peopleDistribution.prepend($title);
    $peopleDistribution.removeClass('loading');
    // check if not countrySuccess, replace with "Error" message
    if (!distributionSuccess) log("People-Distribution: no data");
  }

  // WEALTH
  let wealthSuccess = false;
  const $peopleWealth = $("#people-wealth");
  if ($peopleWealth) {
    const $title = $("<h5>Wealth</h5>");

    // GdpKSqMk
    if (gdpMil) {
      const $p = $("<p></p>");
      const gdpKSqKm = Math.round((gdpMil * 1000) / areaKm);
      // Key
      const $dataKey = $(`<span>GDP density:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(`<span>$${numberWithCommas(gdpKSqKm)}k /Km2<span>`);
      // Slider
      const gdpDensity = dataStore.quartilesObj.gdpDensity;
      // come back
      const $slider = gen$DataSlider(gdpKSqKm, gdpDensity);
      $p.append([$dataKey, $val, $slider]);
      $peopleWealth.append($p);
      wealthSuccess = true;
    }

    // Remove spinner
    $peopleWealth.children('div.spinner-container').remove();
    $peopleWealth.prepend($title);
    $peopleWealth.removeClass('loading');
    // check if not countrySuccess, replace with "Error" message
    if (!wealthSuccess) log("People-Wealth: no data");
  }

  // MIGRATION
  let migrationSuccess = false;
  const $peopleMigration = $("#people-migration");
  if ($peopleMigration) {
    const $title = $("<h5>Migration</h5>");

    // Mig net
    if (migrantsNet) {
      const $p = $("<p></p>");
      const migrantsNetAbs = Math.abs(migrantsNet);
      const minusSym = migrantsNet < 0 ? "-" : "";
      const gainLoss = migrantsNet < 0 ? "(loss)" : "gain";
      // Key
      const $dataKey = $(`<span>Migration:</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(
        `<span>${minusSym}${numberWithCommas(migrantsNetAbs)} ${gainLoss}<span>`
      );
      // Slider
      const migQ = dataStore.quartilesObj.migration;
      const $slider = gen$DataSlider(migrantsNet, migQ);
      $p.append([$dataKey, $val, $slider]);
      $peopleMigration.append($p);
      migrationSuccess = true;
    }

    // Mig cap
    if (migrantsNet) {
      const $p = $("<p></p>");
      const migPer100k = Math.round(migrantsNet/population * 100000);
      const gainLoss = migPer100k < 0 ? "(loss)" : "gain";
      // Key
      const $dataKey = $(`<span>Migration (/100k population):</span>`);
      $dataKey.addClass("data-key");
      // Val
      const $val = $(
        `<span>${numberWithCommas(migPer100k)} ${gainLoss}<span>`
      );
      // Slider
      const mig100kQ = dataStore.quartilesObj.migrationper100k;
      const $slider = gen$DataSlider(migPer100k, mig100kQ);
      $p.append([$dataKey, $val, $slider]);
      $peopleMigration.append($p);
      migrationSuccess = true;
    }

    // Remove spinner
    $peopleMigration.children('div.spinner-container').remove();
    $peopleMigration.prepend($title);
    $peopleMigration.removeClass('loading');
    // check if not countrySuccess, replace with "Error" message
    if (!migrationSuccess) log("People-Wealth: no data");
  }

  // All fininished
  appState.tabDataLoaded["people"] = true;

  /* Methods */
  // Make Ps
  function createPeoplePContainers() {
    const $peopleDiv = $("#data-people");
    $peopleDiv.empty();
    prepContainersFromArray(['people']);
    return;
    const newParaIds = [
      "people-general",
      "people-distribution",
      "people-wealth",
      "people-migration",
    ];
    for (let i = 0; i < newParaIds.length; i++) {
      const id = newParaIds[i];
      const $targetDiv = $(`<div id="${id}" class="loading"></div>`);
      const $spinnerContainer = $('<div class="spinner-container"></div>');
      const $spinner = $('<div class="spinner"></div>');

      $spinnerContainer.append($spinner);
      $targetDiv.append($spinnerContainer);
      $peopleDiv.append($targetDiv);
    }
  }
}

/*      Slider      */
function gen$DataSlider(dataPoint, quartileObj) {
  // Vals
  const minVal = quartileObj.lower;
  const meanVal = quartileObj.iMean;
  const maxVal = quartileObj.upper;
  // Hex colors
  const minHexCol = quartileObj.lowerHex;
  const maxHexCol = quartileObj.upperHex;

  const unitsPre = quartileObj["sliderUnitsPre"] || "";
  const unitsPost = quartileObj["sliderUnitsPost"] || "";

  // Gen positions
  const range = maxVal - minVal;
  // DataPoint
  let dataPointPc = 0;
  let dataPointBlendPc = null;
  let dataPointSide = "left";
  if (dataPoint !== null) {
    if (dataPoint >= maxVal) {
      // Over max
      dataPointPc = 1;
    } else if (dataPoint > minVal) {
      // Somewhere on the line
      dataPointPc = (dataPoint - minVal) / range;
    }
    dataPointBlendPc = dataPointPc;
  }
  if (dataPointPc > 0.5) {
    // If over 50% (RHS), flip
    dataPointPc = 1 - dataPointPc;
    dataPointSide = "right";
  }

  // Mean
  let meanPointPc = 0;
  let meanPointSide = "left";
  if (meanVal !== null) {
    if (meanVal >= maxVal) {
      meanPointPc = 1;
    } else if (meanVal > minVal) {
      meanPointPc = (meanVal - minVal) / range;
    }
  }
  if (meanPointPc > 0.5) {
    // If over 50%, flip
    meanPointPc = 1 - meanPointPc;
    meanPointSide = "right";
  }

  // Midpoint / Balance point
  //   & DataPoint SVG Fill
  let midPointPc = null;
  let midPointHex = null;
  let svgFill = "#ff0000";
  if (quartileObj["balanceHex"]) {
    // Balance point
    const { balanceHex } = quartileObj;
    let balanceVal = quartileObj.balanceVal;
    if (balanceVal === undefined) {
      // No fixed point, use center
      balanceVal = (minVal + maxVal) / 2;
    }
    midPointHex = balanceHex;
    midPointPc = Math.round(((balanceVal - minVal) / range) * 100) + "%";

    // Blend between end and balance point
    if (dataPoint < balanceVal) {
      // Below
      const balanceRange = balanceVal - minVal;
      const subPc = (dataPoint - minVal) / balanceRange;
      svgFill = hexBlend(minHexCol, balanceHex, subPc);
    } else if (dataPoint > balanceVal) {
      // Above
      const balanceRange = maxVal - balanceVal;
      const subPc = (dataPoint - balanceVal) / balanceRange;
      svgFill = hexBlend(balanceHex, maxHexCol, subPc);
    } else {
      // Equal
      svgFill = balanceHex;
    }
  } else {
    // Blend between min/max
    svgFill = hexBlend(minHexCol, maxHexCol, dataPointBlendPc);
  }

  const meanSym = "µ";

  // Slider
  const $slider = $("<div></div>");
  $slider.addClass("data-slider");
  // Line
  const $sliderLine = $("<div></div>");
  $sliderLine.addClass("data-slider-line");
  // Ends
  // Start
  const $sliderEndsStart = $("<div></div>");
  $sliderEndsStart.addClass("data-slider-line-ends data-slider-line-start");
  const $minText = $(
    `<span>${unitsPre}${numberWithCommas(
      Math.round(minVal)
    )}${unitsPost}</span>`
  );
  $sliderEndsStart.append($minText);
  // End
  const $sliderEndsEnd = $("<div></div>");
  $sliderEndsEnd.addClass("data-slider-line-ends data-slider-line-end");
  const $maxText = $(
    `<span>${unitsPre}${numberWithCommas(
      Math.round(maxVal)
    )}${unitsPost}</span>`
  );
  $sliderEndsEnd.append($maxText);
  // Mean
  const $sliderEndMean = $("<div></div>");
  $sliderEndMean.addClass("data-slider-line-ends data-slider-line-mean");
  $sliderEndMean.css(meanPointSide, Math.round(meanPointPc * 100) + "%");
  const $meanText = $(`<span>${meanSym}</span>`);
  $sliderEndMean.append($meanText);
  // Val marker
  const $sliderVal = $("<div></div>");
  $sliderVal.addClass("data-slider-line-ends data-slider-line-val");
  $sliderVal.css(dataPointSide, Math.round(dataPointPc * 100) + "%");
  //   SVG
  const $svg = $(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${svgFill}" stroke="#273d47" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle fill="#ddd" stroke="#273d47" cx="12" cy="10" r="3"></circle></svg>`
  );
  $sliderVal.append($svg);
  // Colours
  const linearBgString = midPointPc
    ? `linear-gradient(90deg, ${minHexCol} 0%, ${midPointHex} ${midPointPc}, ${maxHexCol} 100%)`
    : `linear-gradient(90deg, ${minHexCol} 0%, ${maxHexCol} 100%)`;
  $sliderLine.css("background", linearBgString);
  // Append slider children
  const $sliderLineChildren = [
    $sliderEndsStart,
    $sliderEndMean,
    $sliderEndsEnd,
    $sliderVal,
  ];
  $sliderLine.append($sliderLineChildren);
  // Append line to slider
  const $sliderChildren = [$sliderLine];
  $slider.append($sliderChildren);
  const $sliderContainer = $("<div></div>");
  $sliderContainer.addClass("data-slider-container");
  $sliderContainer.append($slider);
  return $sliderContainer;
}

// Find cloest matching country name
function searchCountryName(userSearchTerm) {
  const term = userSearchTerm.toLowerCase().trim();

  // Check for similarity
  let bestGuess = {
    n: "", // Name
    p: 0, // Percent
    i: -1, // Index
  };

  // Check global var
  const names = dataStore.countryIsoArrays.n;
  if (!names) return;
  const len = names.length || 0;
  if (len < 1) return;

  // Spinner queue
  const spinnerKey = "searchingForCountry";
  addSpinnerToQueue(spinnerKey);

  // Loop countries array
  for (let i = 0; i < len; i++) {
    const country = names[i];
    if (term === country.toLowerCase()) {
      // Perfect match
      bestGuess.n = country;
      bestGuess.p = 1;
      bestGuess.i = i;
      break;
    }
    const pc = similarity(term, country);
    if (pc > bestGuess.p) {
      // Best guess so far
      bestGuess.n = country;
      bestGuess.p = pc;
      bestGuess.i = i;
    }
  }
  // Get index
  const index = bestGuess.i;
  // Edge case Error
  if (index === -1) {
    removeSpinnerFromQueue(spinnerKey);
    log("No match found from search");
    return;
  }
  // Get ISO
  const iso = dataStore.countryIsoArrays.iso[index];
  // Set search input
  appState.previousUserSearch = bestGuess.n;
  $("#search-input").blur();
  $("#search-input").val(bestGuess.n);

  // Load outline
  loadHdOutlineAndTop10FromIso(iso);

  // Load country
  loadNewCountryWiki(iso);

  // Unload spinner from queue
  removeSpinnerFromQueue(spinnerKey);

  /*  Methods */
  function loadHdOutlineAndTop10FromIso(iso) {
    const switchingLayers = iso !== appState.currentIso;
    if (!switchingLayers) return;
    const previousIso = appState.currentIso;
    // Switching layers
    if (mapStore.currentIsoLayer) {
      // Hide current outline
      setLayerInvisible(mapStore.currentIsoLayer);
    }
    // Get new layer, set active
    const layerId = mapStore.layerIso2ToId[iso];
    const layer = mapStore.geoJsonFeatureGroup.getLayer(layerId);
    setLayerActive(layer);

    // Update references
    mapStore.currentIsoLayer = layer;
    if (previousIso) {
      removeCityMarkers(previousIso);
    }
    appState.currentIso = iso;

    // Zoom
    mapStore.appmap.fitBounds(mapStore.tinyLatLngsBounds[iso]);

    // Either: Load Top10, or loadHD outline & then Top10
    const gotHdOutline = mapStore.hdOutlineAlreadyUpdated[iso];
    if (gotHdOutline) {
      // Display capitals
      loadTop10ToMapAndWiki(iso);
    } else {
      // No HD outline yet, fetch
      const feature = mapStore.isoToFeature[iso];
      if (!feature || !layer) {
        // Edge case
        log("Error: Haven't got HD outline, but feature/layer also missing from reference obj(s)");
      }
      const fromClick = true;
      loadHdOutline(iso, layer, feature, fromClick);
    }
  }
}

// Tab UI control
function tabToInfoSection(i) {
  const i2n = {
    0: "wiki",
    1: "weather",
    2: "financial",
    3: "people",
  };
  // convert index to id name
  const suffix = i2n[i] ? i2n[i] : i;
  setTabActive(suffix);
  setSectionVisible(suffix);
  /*  Methods */
  function setTabActive(suffix) {
    const $links = $("#tabs-list").children("li").children("i.nav-link");
    $links.removeClass("active");
    const selector = "#tab-" + suffix;
    $links.filter(selector).addClass("active");
  }
  function setSectionVisible(suffix) {
    const $sections = $("#info-screen")
      .children("div.info-data")
      .children("div");
    $sections.hide();
    const selector = "#data-" + suffix;
    $sections.filter(selector).show();
  }
}

// Spinner queues
function addSpinnerToQueue(key) {
  spinnerQueue[key] = true;
  startNavSpinner();
}
function removeSpinnerFromQueue(key) {
  delete spinnerQueue[key];
  if (Object.keys(spinnerQueue).length === 0) stopNavSpinner();
}
function resetSpinnerQueue() {
  spinnerQueue = {};
  stopNavSpinner();
}

/*    Setup Methods   */

// Storage

// User Coords
function fetchUserCoordsFromStorage() {
  // Fetch user Coords from storage
  const storageKey = storageKeys.USERPOS;
  const storageCoords = fetchAndParseFromStorage(storageKey);
  if (storageCoords) {
    try {
      const lat = storageCoords[0];
      const lng = storageCoords[1];
      mapStore.userPos.lat = lat;
      mapStore.userPos.lng = lng;
      mapStore.fetchedCoordsFromStorage = true;
    } catch (error) {
      log(error);
    }
  }
}

// HD outline expiry dates, for estimating cache status
function initHdCacheExpiryFromStorage() {
  if (!storageIsAvailabile) return;
  const storageKey = storageKeys.HDEXPIRY;
  const jsonString = localStorage.getItem(storageKey);
  if (jsonString) {
    const jsonObj = JSON.parse(jsonString);
    if (jsonObj) {
      mapStore.hdOutlinesExpiryTimes = jsonObj;
    }
  }
}

// Fetch JSON for setup

// Fetch ISO2 and Country Names JSON, and update Search bar
async function fetchNamesAndIsoJson() {
  fetchNamesJson();
  fetchIsoJson();

  /*  Methods */
  // Names
  async function fetchNamesJson() {
    // Try storage
    const storageKey = storageKeys.COUNTRYNAMES;
    const jsonString = fetchFromStorage(storageKey);
    let parsed = JSON.parse(jsonString);
    if (parsed) {
      handleData(parsed);
      return;
    }
    // Try Fetch
    const fileName = "/json/countryarray.json";
    readTextFile(fileName, rtfCallback);
    // Callback
    function rtfCallback(jsonString) {
      if (!jsonString) return;
      const parsed = JSON.parse(jsonString);
      if (!parsed) return;
      // Cache
      saveStringToStorage(storageKey, jsonString);
      handleData(parsed);
    }
    // Handle data
    function handleData(data) {
      dataStore.countryIsoArrays.n = data;
      // Update search bar
      // Bloodhound
      var bloodhoundTt = new Bloodhound({
        datumTokenizer: Bloodhound.tokenizers.whitespace,
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        local: data,
      });
      bloodhoundTt.initialize();
      // Typeahead
      $("#search-input")
        .typeahead(
          {
            minLength: 3,
            highlight: true,
            displayKey: "value",
            valueKey: "value",
          },
          {
            name: "countries",
            source: bloodhoundTt.ttAdapter(),
          }
        )
        .bind("typeahead:selected", select);
      $("#search-input").css("backgroundColor", "");
      function select(e, datum, dataset) {
        appState.previousUserSearch = datum;
        $("#search-input").val(datum);
        searchCountryName(datum);
      }
    }
  }
  // ISO2s
  async function fetchIsoJson() {
    // Try storage
    const storageKey = storageKeys.ISO2;
    const jsonString = fetchFromStorage(storageKey);
    let parsed = JSON.parse(jsonString);
    if (parsed) {
      handleData(parsed.iso2);
      return;
    }
    // Try Fetch
    const fileName = "/json/country-isos.json";
    readTextFile(fileName, rtfCallback);
    // Callback
    function rtfCallback(jsonString) {
      if (!jsonString) return;
      const parsed = JSON.parse(jsonString);
      if (!parsed) return;
      const iso2array = parsed["iso2"];
      if (!iso2array) return;
      // Cache
      saveStringToStorage(storageKey, jsonString);
      handleData(iso2array);
    }
    // Handle data
    function handleData(data) {
      dataStore.countryIsoArrays.iso = data;
    }
  }
}

// Add listeners

// Search input
function addSearchInputListener() {
  const $input = $("#search-input");
  $input.on("keyup", function (e) {
    const userInput = $input.val();
    appState.previousUserSearch = userInput;
    const code = e.keyCode || e.which;
    const enterCode = 13;
    if (code === enterCode) {
      searchCountryName(userInput);
    }
  });
  $("#search-icon").on("click", function () {
    const userInput = $input.val();
    searchCountryName(userInput);
  });
}
function addMenuListeners() {
  // Open menu
  $("#menu-open-hover-zone").on("mouseenter mousedown", menuExpand);
  // Close menu
  $("#info-tabs").on("swipedown swipeleft", menuShrink);
  $("#info-col").on("mouseenter", unlockStickyOpenMenu);
  $("#info-col").on("mouseleave", menuShrink);
  $("#appmap").on("mousedown", menuShrink);
  $("#darken-map").on("mouseenter", menuShrink);
  $("#darken-map").on("click", darkenMapClick);
  function darkenMapClick() {
    unlockStickyOpenMenu();
    menuShrink();
  }
}

// Leaflet layer change buttons
function addMenuLayerListeners() {
  const btnNamesToLayerNames = {
    "street-btn": "street",
    "transport-btn": "transport",
    "dark-btn": "dark",

    "sat-btn": "satellite",
    "night-btn": "night",

    "topo-btn": "topo",
    "ocean-btn": "ocean",
  };
  for (let [k, v] of Object.entries(btnNamesToLayerNames)) {
    document.getElementById(k).addEventListener("click", () => {
      changeLayer(v);
    });
  }
  const overlayIdToName = { "temp-btn": "temp", "rain-btn": "rain" };
  for (let [k, v] of Object.entries(overlayIdToName)) {
    document.getElementById(k).addEventListener("click", () => {
      addOverlay(v);
    });
  }
}

// Settings icon
function addSettingsIconListener() {
  const settingsIcon = document.getElementById("settings-icon");
  settingsIcon.addEventListener("click", () => {
    const div = document.getElementById("right-settings-tab");
    const disp = div.style.display;
    if (disp === "block") {
      div.style.display = "none";
      settingsIcon.classList.remove("active");
    } else {
      div.style.display = "block";
      settingsIcon.classList.add("active");
    }
  });
}

// Tab listeners
function addTabListeners() {
  const suffixes = ["wiki", "weather", "financial", "people"];
  const $tabs = $("#tabs-list").children("li").children("i.nav-link");
  const prefix = "#tab-";
  for (let i = 0; i < suffixes.length; i++) {
    const tabId = prefix + suffixes[i];
    $tabs.filter(tabId).on("click", function () {
      handleTabPress(suffixes[i]);
    });
  }
  /*  Methods */
  function handleTabPress(tabId) {
    if (!appState.currentIso) return;
    tabToInfoSection(tabId);
    if (appState.tabDataLoaded[tabId]) return;
    loadCountryPhp(appState.currentIso, [tabId]);
  }
}

// Leaflet

// Global onEachFeature callback
function onEachFeatureCallback(feature, layer) {
  const iso2_caseUnsure = feature["properties"]["iso2"] || "";
  const iso2 = iso2_caseUnsure.toUpperCase();
  const countryName = feature["properties"]["name"] || "N/A";
  // Update layer reference
  mapStore.layerIso2ToId[iso2] = mapStore.geoJsonFeatureGroup.getLayerId(layer);
  // Update feature reference
  mapStore.isoToFeature[iso2] = feature;
  // Default style
  setLayerInvisible(layer);

  // Generate centre bounds
  if (!mapStore.tinyCentersAreSet) {
    const latLngBounds = layer.getBounds();
    mapStore.tinyLatLngsBounds[iso2] = latLngBounds;
    const centerLatLng = latLngBounds.getCenter();
    mapStore.tinyCenterLatLngs[iso2] = centerLatLng;
  }

  // Event listeners
  layer.on("mouseover", function () {
    // Don't highlight if already viewing
    if (iso2 === appState.currentIso) return;
    highlightLayer(layer);
    suggestSearch(countryName);
    // Load HD if suspected cached
    loadHdFromCacheOnMouseover(iso2, layer, feature);
  });

  layer.on("click", function () {
    // Check if we should ignore click e.g. mobile menu open and user wants to close menu
    if (appState.currentIso && appState.canShrinkMenu === false) {
      // Menu is locked open
      const $darkenMap = $('#darken-map');
      const canLoadCountry = $darkenMap.css('opacity') !== 0.25;
      if (!canLoadCountry) {
        // On Mobile, with menu locked open. Unlock menu, close menu, exit from click to prevent loading country
        unlockStickyOpenMenu();
        menuShrink();
        return;
      }
    }
    unlockStickyOpenMenu();
    const switchedLayers = appState.currentIso !== iso2;
    if (!switchedLayers) return;

    const spinnerKey = "layerClick";
    addSpinnerToQueue(spinnerKey);

    $("#search-input").val(countryName);
    appState.previousUserSearch = countryName;

    // Switching layers
    if (mapStore.currentIsoLayer) {
      // Hide current outline
      setLayerInvisible(mapStore.currentIsoLayer);
    }
    setLayerActive(layer);
    // Update current pointers/references
    const previousIso = appState.currentIso;
    appState.currentIso = iso2;
    mapStore.currentIsoLayer = layer;
    // Load objects
    loadNewCountryWiki(iso2);
    removeCityMarkers(previousIso);
    createFeaturePopup(
      mapStore.currentIsoLayer,
      countryName,
      mapStore.tinyCenterLatLngs[iso2],
      true
    );
    // Fit bounds
    const countryBounds = mapStore.tinyLatLngsBounds[iso2];
    const isMobile = $(window).width() < 992;
    let fitBoundsOptions = {};
    if (isMobile) {
      const yPadding = Math.round($(window).height()/2);
      const paddingBottomRight = L.point(0, yPadding);
      fitBoundsOptions = { "paddingBottomRight": paddingBottomRight };
    }
    mapStore.appmap.fitBounds(countryBounds, fitBoundsOptions);


    if (mapStore.hdOutlineAlreadyUpdated[iso2]) {
      // Already got HD, load top 10
      loadTop10ToMapAndWiki(iso2);
    } else {
      // Get HD (and then top 10, nested inside func)
      const fromClick = true;
      loadHdOutline(iso2, layer, feature, fromClick);
    }
    removeSpinnerFromQueue(spinnerKey);
  });

  layer.on("mouseout", function () {
    if (iso2 === appState.currentIso) return;
    layer.closePopup();
    setLayerInvisible(layer);
    clearSearchOnMouseout();
  });

  // Add layer to GeoJSON FeatureGroup
  mapStore.geoJsonFeatureGroup.addLayer(layer);
}
// Search
function suggestSearch(countryName) {
  const input = document.getElementById("search-input");
  input.value = countryName;
}
// Clear search
function clearSearchOnMouseout() {
  const input = document.getElementById("search-input");
  input.value = appState.previousUserSearch;
}

// Read geoJson ghost layers, add to map
async function addGhostLayers(leaflet, appmap) {
  const file = "/json/countries_small.geo.json";

  $.ajax({
    url: file,
    dataType: "json",
    ifModified: true,
    success: function (data) {
      const ghostLayerGeoJsonText = JSON.stringify(data);
      // Parse
      var ghostLayerGeoJsonData = ghostLayerGeoJsonText
        ? JSON.parse(ghostLayerGeoJsonText)
        : null;
      // Convert to geoJson
      if (ghostLayerGeoJsonData) {
        leaflet.geoJson(ghostLayerGeoJsonData, {
          onEachFeature: onEachFeatureCallback,
        });
        mapStore.tinyCentersAreSet = true;
      }
      mapStore.geoJsonFeatureGroup.addTo(appmap);
    },
    error(error) {
      log("AJAX error getting small GeoJson:");
      log(error);
    },
  });
}

// Popup factory
function createFeaturePopup(layer, countryName, centerLatLng, openPopupBool) {
  const popup = layer.bindPopup(countryName);
  if (openPopupBool) popup.openPopup(centerLatLng);
}

// Leaflet layer Mouseover: fetch HD outline (if thought to be cached)
function loadHdFromCacheOnMouseover(iso2, layer, feature) {
  // Avoid loading on mouseover if expiry times are not loaded from storage
  if (!storageIsAvailabile) return;
  // Exit if error with reading expiry time / missing
  const rawVal = mapStore.hdOutlinesExpiryTimes[iso2];
  if (!rawVal) return;
  // Exit if NaN
  const expiry = Number(rawVal);
  if (!expiry) return;
  // Exit if expiry time is in the past
  const unixNow = getUnixNow();
  if (expiry < unixNow) return;
  const fromClick = false;
  loadHdOutline(iso2, layer, feature, fromClick);
}

// Outline country by ISO2 code
function loadHdOutline(iso2, layer, feature, fromClick) {
  if (mapStore.hdOutlineAlreadyUpdated[iso2]) return;

  const countryName = feature["properties"]["name"] || "N/A";

  /*  Methods */
  // Change outline coords from Tiny -> HD
  function updateLayer(iso2, oldFeature, newHdOutlineCoords) {
    // Remove old layer
    const layerId = mapStore.layerIso2ToId[iso2];
    mapStore.geoJsonFeatureGroup.removeLayer(layerId);
    // Update feature data with coords
    oldFeature.geometry.coordinates = newHdOutlineCoords;
    // Create new feature/layer/geoJson
    const newFeatureLayer = L.geoJSON(oldFeature, {
      onEachFeature: onEachFeatureCallback,
    });
    // Add feature/layer to Group
    mapStore.geoJsonFeatureGroup.addLayer(newFeatureLayer);
    // Get new ID
    const newLayerId = mapStore.geoJsonFeatureGroup.getLayerId(newFeatureLayer);
    // Update references
    mapStore.layerIso2ToId[iso2] = newLayerId;
    // Set active styling, if clicked on
    if (fromClick) {
      setLayerInvisible(mapStore.currentIsoLayer);
      mapStore.currentIsoLayer = newFeatureLayer;
      setLayerActive(newFeatureLayer);
      removeCityMarkers(iso2);
      loadTop10ToMapAndWiki(iso2);
    }
    // Set popup
    createFeaturePopup(
      newFeatureLayer,
      countryName,
      mapStore.tinyCenterLatLngs[iso2],
      fromClick
    );
    // Update references
    mapStore.hdOutlineAlreadyUpdated[iso2] = true;
    delete mapStore.isoToFeature[iso2];
  }
  // Update expiry time reference variable (and storage)
  function updateExpiryTime(iso2, expiryTime) {
    mapStore.hdOutlinesExpiryTimes[iso2] = expiryTime;
    updateStorageHdCacheExpiry();
  }
  // Util, save to storage: HD outline expiry times
  function updateStorageHdCacheExpiry() {
    if (!storageIsAvailabile) return;
    const storageKey = storageKeys.HDEXPIRY;
    const jsonString = JSON.stringify(mapStore.hdOutlinesExpiryTimes);
    if (jsonString) {
      localStorage.setItem(storageKey, jsonString);
    }
  }

  // Fetch outline JSON
  $.ajax({
    url: "/json/outlines/" + iso2 + ".json",
    dataType: "json",
    ifModified: true,
    success: function (data, textStatus, request) {
      const expiryTime = getReqExpiry(request);
      const jsonString = JSON.stringify(data);
      let newHdOutlineCoords = JSON.parse(jsonString);
      if (newHdOutlineCoords) {
        const layerType = layer.feature.geometry.type;
        if (layerType === "MultiPolygon") {
          newHdOutlineCoords = newHdOutlineCoords.map((island) => {
            return [island];
          });
        }

        // Update cache expiry time reference var / save to storage
        updateExpiryTime(iso2, expiryTime);

        // Update layer
        updateLayer(iso2, feature, newHdOutlineCoords);
        return;
      } else {
        log("Error parsing HD outline JSON");
      }
    },
    error(error) {
      log("AJAX error getting country outline:");
      log(error);
    },
  });
}
// From clicking layer, add Markers to that iso2 layer
function loadTop10ToMapAndWiki(iso2) {
  const layerGroup = mapStore.iso2Top10Cities[iso2];
  if (layerGroup) {
    // Already loaded
    layerGroup.addTo(mapStore.appmap);
    // Populate Wiki tab
    const top10 = mapStore.isoToTop10Json[iso2];
    if (top10) addCitiesToWiki(top10);
  } else {
    // Data missing, fetch
    fetchTop10(iso2);
  }
}
// Remove city Marker layers from map
function removeCityMarkers(iso2) {
  const markers = mapStore.iso2Top10Cities[iso2];
  if (!markers) return;
  markers.removeFrom(mapStore.appmap);
  return;
}

// Set country layer outline as: active
function setLayerActive(layer) {
  const active = { opacity: 0.8, fillOpacity: 0, color: "#112288" };
  layer.setStyle(active);
}
// Set country layer outlien as: invisible
function setLayerInvisible(layer) {
  const invisible = { opacity: 0, fillOpacity: 0 };
  layer.setStyle(invisible);
}
// Set country layer outlien as: invisible
function highlightLayer(layer) {
  const highlighted = {
    opacity: 0.8,
    fillOpacity: 0.15,
    color: "#112288",
    fillColor: "#112233",
  };
  layer.setStyle(highlighted);
}

// Initiate default leaflet tile layer on load
function initLayer() {
  const defaultLayerName = "street";
  changeLayer(defaultLayerName);
}

// Changing map/tile layer
async function changeLayer(layerName) {
  // Pick Layer object
  let newLayer = mapStore.layersObj[layerName];
  if (!newLayer) return;
  // Remove old Layer
  removeCurrentLayer();
  // Change current (active) layer variable string
  mapStore.currentLayerName = layerName;
  // Add new Layer object to Map
  mapStore.appmap.addLayer(newLayer);

  // Remove current tile layer when switching tile style
  function removeCurrentLayer() {
    let pickedLayer = mapStore.layersObj[mapStore.currentLayerName];
    if (pickedLayer) pickedLayer.removeFrom(mapStore.appmap);
  }
}

// Add OVerlay layer to map
async function addOverlay(overlayName) {
  // Remove ticks
  untickAll();
  if (mapStore.currentOverlayName === overlayName) {
    removeCurrentOverlay();
    mapStore.currentOverlayName = "";
    return;
  }
  // Pick Overlay object
  let newOverlay = mapStore.overlaysObj[overlayName];

  if (!newOverlay)  return
  // Remove old Overlay
  removeCurrentOverlay();
  // Change current (active) Overlay variable string
  mapStore.currentOverlayName = overlayName;
  // Add new Overlay object to Map
  mapStore.appmap.addLayer(newOverlay);
  newOverlay.setZIndex(77);
  // Tick new checkbox
  tickNewInput();
  function removeCurrentOverlay() {
    // Remove current tile layer when switching tile style
    let pickedOverlay = mapStore.overlaysObj[mapStore.currentOverlayName];
    if (pickedOverlay) pickedOverlay.removeFrom(mapStore.appmap);
  }
  function untickAll() {
    $('#menu-buttons-container').children('div').children("input[name='map-overlay']").prop("checked", false);
  }
  function tickNewInput() {
    $('#menu-buttons-container').children('div').children(`input[value='${overlayName}']`).prop("checked", true);
  }
}

// Remove all / any overlays
async function removeOverlay() {
  const overlayNames = ["temp", "rain"];
  for (let i = 0; i < overlayNames.length; i++) {
    const overlayName = overlayNames[i];
    const pickedOverlay = mapStore.overlaysObj[overlayName];
    try {
      if (pickedOverlay) pickedOverlay.removeFrom(mapStore.appmap);
    } catch (error) {
      log(error);
    }
  }
}

// Center on user location
async function zoomToUser() {
  function zoomToCoords(userLatLng) {
    mapStore.appmap.setView(userLatLng, mapStore.defaultZoom);
    // Set / move marker
    if (mapStore.userPosMarker === null) {
      // Set
      initUserLocationIcon(userLatLng);
    } else {
      // Update
      mapStore.userPosMarker.setLatLng(userLatLng);
    }
  }

  let msWait = 20;
  let coordsUpdated = false;
  for (let i = 0; i < 3; i++) {
    // Loop
    setTimeout(() => {
      if (coordsUpdated) return;
      if (mapStore.userPos.lat !== null && mapStore.userPos.lng !== null) {
        const userLatLng = [mapStore.userPos.lat, mapStore.userPos.lng];
        zoomToCoords(userLatLng);
        coordsUpdated = true;
      }
    }, msWait);
    if (coordsUpdated) break;
    msWait *= 5;
  }
}

// Storage user location in localStorage
function cacheUserPos(userPos) {
  if (!storageIsAvailabile) return null;
  const stringified = JSON.stringify(userPos);
  const key = storageKeys.USERPOS;
  localStorage.setItem(key, stringified);
}

// Generate user location icon
function initUserLocationIcon(userLatLng) {
  // Custom icon
  var crosshairIcon = L.icon({
    iconUrl: "/images/icons/crosshair-blue.png",
    iconSize: [38, 38], // size of the icon: x-width, y-height
    iconAnchor: [16, 16], // point of the icon which will correspond to marker's location
    popupAnchor: [4, -18], // point from which the popup should open relative to the iconAnchor
  });
  // Set marker
  const draggable = true;
  mapStore.userPosMarker = L.marker(userLatLng, {
    draggable,
    icon: crosshairIcon,
  }).addTo(mapStore.appmap);
  const popupText = generateUserLocationPopupText(userLatLng);
  mapStore.userPosMarker.bindPopup(popupText).openPopup();
  mapStore.userPosMarker.addEventListener("dragend", setNewUserPosCallback);

  // Update user position coords variables when location is dragged to new
  function setNewUserPosCallback() {
    const newLatLng = mapStore.userPosMarker.getLatLng();
    if (!newLatLng) return;
    const { lat, lng } = newLatLng;
    if (lat === null || lng === null) return;
    mapStore.userPos.lat = lat;
    mapStore.userPos.lng = lng;
    const userLatLng = [lat, lng];
    const popupText = generateUserLocationPopupText(userLatLng);
    cacheUserPos(userLatLng);
    mapStore.userPosMarker.bindPopup(popupText);
  }
  // Format user coords to string
  function generateUserLocationPopupText(userLatLng) {
    const latText = userLatLng[0].toFixed(4);
    const lngText = userLatLng[1].toFixed(4);
    return "<b>Latitude: </b>" + latText + "<br /><b>Longitude: </b>" + lngText;
  }
}

// Add (+) Crosshair location icon to map
function addUserLocationCrosshair() {
  L.easyButton("fa-crosshairs fa-lg", function (btn, map) {
    // Get location if not already set
    if (
      mapStore.userPos.lat === null ||
      mapStore.userPos.lng === null ||
      !mapStore.fetchCoordsFromNav
    )
      updateUserCoords();
    // Zoom to user location
    zoomToUser();
  }, 'Location').addTo(mapStore.appmap);

  function updateUserCoords() {
    if (!navigator) {
      log("No navigator.");
      return;
    }
    if (!navigator.geolocation) {
      log("Geolocation is not supported by this browser.");
      return;
    }

    var posOptions = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0,
    };

    function onSuccess(pos) {
      const { coords } = pos;
      if (!coords) return;
      const { latitude, longitude } = coords;
      // Check if parse-able
      const latitudeNumber = Number(latitude);
      const longitudeNumber = Number(longitude);
      if (isNaN(latitudeNumber)) return;
      if (isNaN(longitudeNumber)) return;
      // If reached here, coords have been parsed to int
      mapStore.userPos.lat = latitudeNumber;
      mapStore.userPos.lng = longitudeNumber;
      mapStore.fetchCoordsFromNav = true;
      cacheUserPos([latitudeNumber, longitudeNumber]);
    }

    function onError(err) {
      let errorMessage = "Unable to get your location.";
      const { code, message } = err;
      switch (code) {
        case 1:
          errorMessage =
            "Permission needs to be granted in your browser to get current location.";
          break;
      }
      if (!errorMessage) {
        // Message not retrieved from Switch
        if (message) {
          // Pass error message down
          errorMessage = message;
        } else {
          // No error message generated, pass generic error message
          errorMessage = "Unable to get your location.";
        }
      }
      alert(errorMessage);
    }
    navigator.geolocation.getCurrentPosition(onSuccess, onError, posOptions);
  }
}

// Fetch Top10 cities JSON from either: storage, or API (then store)
function fetchTop10(iso2) {
  // Try stroage
  const iso2Top10 = fetchTop10FromStorage(iso2);
  if (iso2Top10) {
    // Storage success, exit
    setTimeout(() => {
      // Add to map
      addTop10ToMap(iso2, iso2Top10);
      // Add to left Wiki info panel
      addCitiesToWiki(iso2Top10);
    }, 250);
  } else {
    // Storage fail, try API
    fetchFromApi(iso2);
  }

  // Fetch Top10 JSON from API
  function fetchFromApi(iso2) {
    const spinnerKey = "fetchTop10FromApi";
    addSpinnerToQueue(spinnerKey);
    $.ajax({
      url: "/json/top10.json",
      dataType: "json",
      ifModified: true,
      success: function (data) {
        const jsonString = JSON.stringify(data);
        const top10 = JSON.parse(jsonString);
        if (top10) {
          // Cache
          const unixNow = getUnixNow();
          const top10Obj = { d: top10, t: unixNow };
          mapStore.isoToTop10Json = top10;
          updateStorage(top10Obj);
          const iso2Top10 = top10[iso2];
          if (!iso2Top10) return;
          // Add to map
          addTop10ToMap(iso2, iso2Top10);
          // Add to left Wiki info panel
          addCitiesToWiki(iso2Top10);
        } else {
          log("Error parsing Top10 JSON");
        }
        removeSpinnerFromQueue(spinnerKey);
      },
      error(error) {
        log("AJAX error getting Top10:");
        log(error);
        removeSpinnerFromQueue(spinnerKey);
      },
    });
  }
  // Fetch Top10 object from storage
  function fetchTop10FromStorage(iso2) {
    const storageKey = storageKeys.TOP10;
    const top10 = fetchAndParseFromStorage(storageKey);
    if (!top10) return null;

    const timestamp = top10.t;
    if (!timestamp) return null; // Fetch from API

    const data = top10.d;
    if (!data) return null;
    mapStore.isoToTop10Json = data;

    const iso2Top10 = data[iso2];
    if (!iso2Top10) return null;

    return iso2Top10;
  }
  // Cache data to storage
  function updateStorage(obj) {
    if (!storageIsAvailabile) return;
    const storageKey = storageKeys.TOP10;
    const jsonString = JSON.stringify(obj);
    if (jsonString) {
      localStorage.setItem(storageKey, jsonString);
    }
  }
  // Add Top10 data to map layer in FeatureGroup
  function addTop10ToMap(iso2, newData) {
    const spinnerKey = "addTop10ToMap";
    addSpinnerToQueue(spinnerKey);
    const len = newData.length;
    const defaultOptions = {
      draggable: false,
      autoPan: true,
    };
    let markers = L.layerGroup();
    for (let i = 0; i < len; i++) {
      const city = newData[i];
      const { n, p, x, y } = city;
      const isCap = city["cap"];
      const latLng = [y, x];
      const options = { ...defaultOptions };
      if (isCap) {
        // Capital
        const iconUrl = "/images/icons/city-gold.png";
        const multiplier = 1.15;
        const width = Math.round(25 * multiplier);
        const height = Math.round(41 * multiplier);
        const iconSize = [width, height];
        const iconAnchor = [Math.round(width / 2), height];
        const popupAnchor = [0, height * -0.9];
        // Gen gold capital icon
        const goldIcon = L.icon({
          iconUrl,
          iconSize,
          iconAnchor,
          popupAnchor,
        });
        options.icon = goldIcon;
      } else {
        // Not Capital
        const opacity = 1 - i / 15;
        options.opacity = opacity;
      }
      // Gen marker
      const marker = L.marker(latLng, options);
      marker.bindPopup(n);
      marker.on("click", function () {
        marker.openPopup(latLng);
      });
      marker.on("mouseover", function () {
        suggestSearch(n);
      });
      marker.on("mouseout", function () {
        clearSearchOnMouseout();
      });
      markers.addLayer(marker);
    }
    if (mapStore.iso2Top10Cities[iso2])
      mapStore.iso2Top10Cities[iso2].removeFrom(mapStore.appmap);
    mapStore.iso2Top10Cities[iso2] = markers;
    markers.addTo(mapStore.appmap);
    removeSpinnerFromQueue(spinnerKey);
  }
}

// Loop through Top10 cities array, create DOM objects of citites, and add to left panel wiki div
function addCitiesToWiki(cities) {
  if (!cities) return;
  const len = cities.length;

  // Gen ul
  const $ul = $('<ul id="top-cities"></ul>');
  // Loop cities and add to target el
  for (let i = 0; i < len; i++) {
    const city = cities[i];
    const { n, p } = city;
    // Name span
    let nEscaped = n.replace(/"/g, "\n22");
    nEscaped = nEscaped.replace(/'/g, "\n27");
    const $nameSpan = $(`<span>${nEscaped}<span>`);
    // Population span
    const pFormatted = numberWithCommas(p);
    const $popSpan = $(`<span class="population">(${pFormatted})<span>`);
    // Gen li
    const $li = $(`<li></li>`);
    // Gen img
    const $img = $(`<img></img>`);
    // Capital
    const isCap = city["cap"];
    if (isCap) {
      $li.addClass("capital");
    } else {
      const opacity = 1 - i / 15;
      $img.css({ opacity: opacity });
    }
    // Build
    $li.append($img);
    $li.append($nameSpan);
    $li.append($popSpan);

    $ul.append($li);
  }
  // Get target element
  const $targetDiv = $("div#wiki-top10");
  // Gen title
  const $title = $("<h5>Top 10 cities</h5>");

  // Build
  $targetDiv.append($ul);
  // Remove spinner
  $targetDiv.children('div.spinner-container').remove();
  $targetDiv.prepend($title);
  $targetDiv.removeClass('loading');
}

// Temp lock left menu open until mouseenter of left menu
function lockStickyOpenMenu() {
  appState.canShrinkMenu = false;
}
function unlockStickyOpenMenu() {
  if (!appState.canShrinkMenu) appState.canShrinkMenu = true;
}

// Currencies
// Wrapper
async function loadAllCurrencyData() {
  const spinnerKey = "loadAllCurrencyData";
  addSpinnerToQueue(spinnerKey);

  _loadIso2Currencies();
  _loadCurrencyNamesAndSymbols();

  removeSpinnerFromQueue(spinnerKey);
  /* Methods */
  async function _loadIso2Currencies() {
    const spinnerKey = "loadIso2Currencies";
    addSpinnerToQueue(spinnerKey);
    // Try storage
    const storageKey = storageKeys.ISO2CURRENCIES;
    if (storageIsAvailabile) {
      const parsed = fetchAndParseFromStorage(storageKey);
      if (parsed) {
        dataStore.iso2ToCurrencies = parsed;
        removeSpinnerFromQueue(spinnerKey);
        return;
      }
    }
  
    // Storage failed to fetch,
    // Fetch JSON
    const url = `/json/country-currencies.json`;
    $.ajax({
      url: url,
      dataType: "json",
      success: function (data) {
        const dataString = JSON.stringify(data);
        if (!dataString) {
          ajaxUnload();
          return;
        }
        // Parse
        const parsed = JSON.parse(dataString);
        if (!parsed) {
          ajaxUnload();
          return;
        }
        // Success
        const parsedSplit = {};
        for (let [k, v] of Object.entries(parsed)) {
          const newVal = { code: v[0] };
          if (v.length > 1) {
            let otherLongFormat = v[1];
            let others = [];
            while (otherLongFormat.length >= 3) {
              const start = otherLongFormat.substring(0, 3);
              others.push(start);
              otherLongFormat = otherLongFormat.substring(3);
            }
            if (others.length > 0) newVal["others"] = others;
          }
          parsedSplit[k] = newVal;
        }
        dataStore.iso2ToCurrencies = parsedSplit;
        saveToCache(parsedSplit);
        ajaxUnload();
      },
      error(error) {
        log("AJAX error getting country Currencies JSON");
        log(error);
        ajaxUnload();
      },
    });
    function saveToCache(obj) {
      if (storageIsAvailabile) saveObjToStorage(storageKey, obj);
    }
    function ajaxUnload() {
      removeSpinnerFromQueue(spinnerKey);
    }
  }
  async function _loadCurrencyNamesAndSymbols() {
    const spinnerKey = "loadCurrencyNamesAndSymbols";
    addSpinnerToQueue(spinnerKey);
    // Try storage
    const storageKey = storageKeys.CURRENCYCNS;
    if (storageIsAvailabile) {
      const parsed = fetchAndParseFromStorage(storageKey);
      if (parsed) {
        dataStore.currencyCodeToNameAndSymbol = parsed;
        removeSpinnerFromQueue(spinnerKey);
        return;
      }
    }
  
    // Storage failed to fetch,
    // Fetch JSON
    const url = `/json/currency-cns.json`;
    $.ajax({
      url: url,
      dataType: "json",
      success: function (data) {
        const dataString = JSON.stringify(data);
        if (!dataString) {
          ajaxUnload();
          return;
        }
        // Parse
        const parsed = JSON.parse(dataString);
        if (!parsed) {
          ajaxUnload();
          return;
        }
        // Success
        dataStore.currencyCodeToNameAndSymbol = parsed;
        saveToCache(parsed);
        ajaxUnload();
      },
      error(error) {
        log("AJAX error getting CurrencyCNS JSON");
        log(error);
        ajaxUnload();
      },
    });
    function saveToCache(obj) {
      if (storageIsAvailabile) saveObjToStorage(storageKey, obj);
    }
    function ajaxUnload() {
      removeSpinnerFromQueue(spinnerKey);
    }
  }
}

// Weather
function getWeatherRanges() {
  // UV index: if >=
  const uviMin = [
    { 11: "Extreme" },
    { 8: "Very High" },
    { 6: "High" },
    { 3: "Okay" },
    { 1: "Low" },
    { 0: "None" },
  ];
  // Clouds (%)
  // 0 - 100

  // Humidity (%)
  // 0 - 100

  // Visibility (m)
  // 0 - 10,000 ?

  // Wind
  // Speed (m/s)
  const windSpeedMin = [
    { 40: "Hurricane" },
    { 33: "Storm" },
    { 23: "Strong" },
    { 13: "Windy" },
    { 6: "Breezy" },
    { 0: "Still" },
  ];
  // Deg (degrees from N, going clockwise): 0 N, 90 E, 180 S, 270 W
  // 0 - 360

  // Rain, mm/hr
  const rainMmHrMin = [
    { 30: "Violent" },
    { 10: "Very Heavy" },
    { 8: "Heavy" },
    { 4: "Rainy" },
    { 1: "Light" },
    { 0: "Dry" },
  ];
  // Pop (5) Probability Of Precipitation
  // 0 - 100

  // Snow, mm/hr
  const snowMmHrMin = [
    { 75: "Dangerous" },
    { 50: "Very Heavy" },
    { 25: "Heavy" },
    { 12: "Snowy" },
    { 6: "Light" },
    { 0: "None" },
  ];

  // Visibility, meter
  const visMeterMin = [
    { 3000: "Clear" },
    { 1200: "Light Mist" },
    { 0: "Heavy Fog" },
  ];

  // MoonPhase
  // 0    Full
  //      Waxing crescent
  // 0.25 first quarter
  //      Waxing gibous
  // 0.5  half
  //      Waning gibous
  // 0.75 last quarter
  //      Waning crescent
  // 1    Full
  return {
    windSpeedMin,
    uviMin,
    rainMmHrMin,
    snowMmHrMin,
    visMeterMin,
  };
}

// Financial
// Currencies
async function loadQuartiles() {
  const spinnerKey = "loadQuartiles";
  addSpinnerToQueue(spinnerKey);

  // Try storage
  const storageKey = storageKeys.QUARTILES;
  if (storageIsAvailabile) {
    const parsed = fetchAndParseFromStorage(storageKey);
    if (parsed) {
      dataStore.quartilesObj = parsed;
      removeSpinnerFromQueue(spinnerKey);
      return;
    }
  }

  // Storage failed to fetch,
  // Fetch JSON
  const url = `/json/quartiles.json`;
  $.ajax({
    url: url,
    dataType: "json",
    success: function (data) {
      const dataString = JSON.stringify(data);
      if (!dataString) {
        ajaxUnload();
        return;
      }
      // Parse
      const parsed = JSON.parse(dataString);
      if (!parsed) {
        ajaxUnload();
        return;
      }
      // Success
      dataStore.quartilesObj = parsed;
      saveToCache(parsed);
      ajaxUnload();
    },
    error(error) {
      log("AJAX error getting Quartiles JSON");
      log(error);
      ajaxUnload();
    },
  });
  function saveToCache(obj) {
    if (storageIsAvailabile) saveObjToStorage(storageKey, obj);
  }
  function ajaxUnload() {
    removeSpinnerFromQueue(spinnerKey);
  }
}

/*      Utils     */

const log = (m) => console.log(m)

function numberWithCommas(x) {
    // 1999000.123 => 1,999,000.123
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

// Compare strings, return 0->1
function similarity(s1, s2) {
    var longer = s1;
    var shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    var longerLength = longer.length;
    if (longerLength == 0) {
        return 1.0;
    }
    return (longerLength - _editDistance(longer, shorter)) / parseFloat(longerLength);
    function _editDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
    
        var costs = new Array();
        for (var i = 0; i <= s1.length; i++) {
            var lastValue = i;
            for (var j = 0; j <= s2.length; j++) {
                if (i == 0)
                    costs[j] = j;
                else {
                    if (j > 0) {
                        var newValue = costs[j - 1];
                        if (s1.charAt(i - 1) != s2.charAt(j - 1))
                            newValue = Math.min(Math.min(newValue, lastValue),
                                costs[j]) + 1;
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0)
                costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }
}

// Generate blended color
function hexBlend(col1, col2, pc) {
    if (pc < 0) pc = 0;
    if (pc > 1) pc = 1;
    const col1RgbArray = _hexToRgb(col1);
    const col2RgbArray = _hexToRgb(col2);

    const col3RgbArray = _blendRgb(col1RgbArray, col2RgbArray, pc);
    const blendHexString = _rgbToHexString(col3RgbArray);
    return blendHexString;
    /* Methods */
    function _hexToRgb(hex) {
        const sixChar = _expandHexToSixChar(hex);
        return [
            parseInt(sixChar[0] + sixChar[1], 16),
            parseInt(sixChar[2] + sixChar[3], 16),
            parseInt(sixChar[4] + sixChar[5], 16)
        ];
        function _expandHexToSixChar(colShort) {
            if (colShort.length == 4) {
                const ch1 = colShort[1];
                const ch2 = colShort[2];
                const ch3 = colShort[3];
                return ch1+ch1 + ch2+ch2 + ch3+ch3;
            }
            return colShort.substring(1);
        }
    }
    function _blendRgb(rgb1, rgb2, pc) {
        return [ 
            (1 - pc) * rgb1[0] + pc * rgb2[0], 
            (1 - pc) * rgb1[1] + pc * rgb2[1], 
            (1 - pc) * rgb1[2] + pc * rgb2[2]
        ];
    }
    function _rgbToHexString(rgbArray) {
        const rHex = _intToHex(rgbArray[0]);
        const gHex = _intToHex(rgbArray[1]);
        const bHex = _intToHex(rgbArray[2]);
        return '#' + rHex + gHex + bHex;

        function _intToHex(num) {
            var hex = Math.round(num).toString(16);
            if (hex.length == 1)
                hex = '0' + hex;
            return hex;
        }
    }
}

// Get unix seconds
function getUnixNow() {
  return Math.floor(Date.now() / 1000);
}

// Read api key
//function readTextFile(file, callback) {
async function readTextFile(file, callback) {
  var req = new XMLHttpRequest();
  req.open("GET", file, false);
  req.onreadystatechange = () => {
    if (req.readyState === 4 && (req.status === 200 || req.status == 0))
      callback(req.responseText);
  };
  req.send(null);
}

// Test localStorage
function isStorageAvailabile() {
  const test = "test";
  try {
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

// Fetch (and NOT parse) JSON string from localStorage
function fetchFromStorage(key) {
  if (!storageIsAvailabile) return null;
  const storageString = localStorage.getItem(key);
  if (!storageString) return null;
  return storageString;
}
// Fetch (and parse) JSON from localStorage
function fetchAndParseFromStorage(key) {
  const jsonString = fetchFromStorage(key);
  if (!jsonString) return null;
  const parsed = JSON.parse(jsonString);
  if (!parsed) return null;
  return parsed;
}
// Save to stroage
function saveStringToStorage(key, string) {
  if (!storageIsAvailabile) return null;
  localStorage.setItem(key, string);
}
function saveObjToStorage(key, obj) {
  if (!storageIsAvailabile) return null;
  const string = JSON.stringify(obj);
  saveStringToStorage(key, string);
}

// Parse HTTP Respnse Header
function getReqExpiry(req) {
  const cacheControl = req.getResponseHeader("Cache-Control");
  const unixNow = getUnixNow();
  if (cacheControl) {
    const prefix = "max-age=";
    if (cacheControl.startsWith(prefix)) {
      const prefixLen = prefix.length;
      const middleAndEnd = cacheControl.substring(prefixLen);
      const indexComma = middleAndEnd.indexOf(",");
      if (indexComma !== -1) {
        const secondsString = middleAndEnd.substring(0, indexComma);
        if (secondsString) {
          const secondsInt = Number(secondsString);
          if (secondsInt && typeof secondsInt === "number" && secondsInt > 0)
            return unixNow + secondsInt;
        }
      }
    }
  }
  // Error, return already-expired timestamp
  return 0;
}

// Find country name from ISO2 code
function nameToIso2(name) {
  const nameLower = name.toLowerCase().trim();
  const countries = dataStore.countryIsoArrays.n;
  let index = -1;
  for (let i = 0; i < countries.length; i++) {
    const country = countries[i].toLowerCase();
    if (country === nameLower) continue;
    index = i;
    break;
  }
  if (index === -1) return null;
  const iso = dataStore.countryIsoArrays.iso[index];
  return iso;
}

// Time string util, convert minutes in today, to 24hr clock time e.g. 14:30
function convertMinuteToTimeString(minutes) {
  const hours = Math.floor(minutes / 60);
  let hour = hours.toString();
  while (hour.length < 2) hour = "0" + hour;
  const minutesOnly = minutes % 60;
  let minute = minutesOnly.toString();
  while (minute.length < 2) minute = "0" + minute;
  return `${hour}:${minute}`;
}

/*    Global Objects    */
function genLayersObj() {
  const tileUrlFormats = genTileUrlFormats();
  const tileAttr = genTileAttr();
  return {
    street: L.tileLayer(tileUrlFormats.street, {
      maxZoom: 19,
      attribution: tileAttr.street,
    }),
    transport: L.tileLayer(tileUrlFormats.transport, {
      maxZoom: 22,
      attribution: tileAttr.thunderforest,
    }),
    dark: L.tileLayer(tileUrlFormats.dark, {
      maxZoom: 20,
      attribution: tileAttr.stadia,
    }),

    satellite: L.tileLayer(tileUrlFormats.sat, {
      attribution: tileAttr.esri,
    }),
    night: L.tileLayer(tileUrlFormats.night, genNightOptions()),

    topo: L.tileLayer(tileUrlFormats.topo, {
      maxZoom: 17,
      attribution: tileAttr.topo,
    }),
    ocean: L.tileLayer(tileUrlFormats.ocean, {
      maxZoom: 13,
      attribution: tileAttr.ocean,
    }),
  };
  // URL formats
  function genTileUrlFormats() {
    return {
      street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      transport: "/php/tile/get.php?id=transport&z={z}&x={x}&y={y}",
      dark: "/php/tile/get.php?id=dark&z={z}&x={x}&y={y}",

      sat: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      night: "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/{time}/{tilematrixset}{maxZoom}/{z}/{y}/{x}.{format}",

      topo: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      ocean: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/{z}/{y}/{x}",
    };
  }
  // Attribution
  function genTileAttr() {
    return {
      street:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      thunderforest:
        '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      stadia:
        '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',

      esri: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      nasa: 'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (<a href="https://earthdata.nasa.gov">ESDIS</a>) with funding provided by NASA/HQ.',

      topo: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      ocean:
        "Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri",
    };
  }
  // Options (night)
  function genNightOptions() {
    return {
      minZoom: 1,
      maxZoom: 8,
      format: "jpg",
      time: "",
      tilematrixset: "GoogleMapsCompatible_Level",
      attribution: tileAttr.nasa,
    };
  }
}

// Generate Overlay objects
function genOverlaysObj() {
  const tileUrlFormats = genTileUrlFormats();
  const maxZoom = 19;
  const attribution =
    'Map data &copy; <a href="http://openweathermap.org">OpenWeatherMap</a>';
  const opacity = 0.8;
  const options = {
    maxZoom,
    attribution,
    opacity,
  };

  const tempOptions = { ...options };
  tempOptions.opacity = 0.975;
  return {
    temp: L.tileLayer(tileUrlFormats.temp, tempOptions),
    rain: L.tileLayer(tileUrlFormats.rain, options),
  };
  // URL formats
  function genTileUrlFormats() {
    return {
      temp: "/php/tile/get.php?id=temp&z={z}&x={x}&y={y}",
      rain: "/php/tile/get.php?id=rain&z={z}&x={x}&y={y}"
    };
  }
}

// Finished
loadQuartiles();
stopPageSpinner();
stopNavSpinner();