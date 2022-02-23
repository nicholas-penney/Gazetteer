<?php

/*              Import utils                */


function getStartAndEndOfCurrentIntervals()
{
    /**
     * Return format:
     * array: [
     *   "min":  [start_unix, end_unix],
     *   "hour": [start_unix, end_unix],
     *   "day":  [start_unix, end_unix],
     *   "mon":  [start_unix, end_unix],
     * ]
     */
    
    // CONST
    $SECS_IN_MINUTE = 60;
    $SECS_IN_HOUR = 3600;
    $SECS_IN_DAY = 86400;
    
    // Get date
    $now_date = getdate();

    // Unpack date
    $now_seconds = $now_date['seconds'];
    $now_minutes = $now_date['minutes'];
    $now_month = $now_date['mon'];
    $now_year = $now_date['year'];
    $now_unix = $now_date[0];

    // Minute
    $min_start_unix = $now_unix - $now_seconds;
    $min_end_unix = $min_start_unix + $SECS_IN_MINUTE;
    $min_array = [$min_start_unix, $min_end_unix];

    // Hour
    $now_minutes_in_secs = $now_minutes * $SECS_IN_MINUTE;
    $hour_start_unix = $now_unix - $now_minutes_in_secs - $now_seconds;
    $hour_end_unix = $hour_start_unix + $SECS_IN_HOUR;
    $hour_array = [$hour_start_unix, $hour_end_unix];

    // Day
    $days_since_epoch = floor($now_unix / $SECS_IN_DAY);
    $day_start_unix = $days_since_epoch * $SECS_IN_DAY;
    $day_end_unix = $day_start_unix + $SECS_IN_DAY;
    $day_array = [$day_start_unix, $day_end_unix];

    // Month
    $utc_zone = new DateTimeZone("GMT0");
    $mon_start_date_string = "1-${now_month}-${now_year}";
    $mon_start_date = DateTime::createFromFormat('d-m-Y', $mon_start_date_string, $utc_zone);
    $mon_start_date->setTime(0,0);

    $mon_end_date = DateTime::createFromFormat('d-m-Y', $mon_start_date_string, $utc_zone);
    $mon_end_date->setTime(0,0);
    $mon_end_date->modify('+1 month');

    $mon_start_unix = $mon_start_date->getTimestamp();
    $mon_end_unix = $mon_end_date->getTimestamp();
    $mon_array = [$mon_start_unix, $mon_end_unix];
    
    // Return
    $rtn_assoc = [];
    $rtn_assoc['min'] = $min_array;
    $rtn_assoc['hour'] = $hour_array;
    $rtn_assoc['day'] = $day_array;
    $rtn_assoc['mon'] = $mon_array;

    return $rtn_assoc;
}

/*              Setup               */

// Header for response to AJAX
$header_json = 'Content-Type: application/json; charset=UTF-8';
header($header_json);

// Assoc array to send to client
$result_arr = [];

/*              Parse request               */

// Get AJAX request header
$iso2 = "";
// Check if ISO2 arg is present
if (!isset($_GET['iso2'])) {
    // ISO2 error
    badRequest();
    //echoResJson();
    die();
}
// gb => GB
$iso2 = strtoupper($_GET['iso2']);


// Check if ISO2 arg is valid
$country_name = iso2ToCountryName($iso2);

if (is_null($country_name)) {
    // Server error
    internalServer();
    die();
}
if ($country_name == false) {
    // ISO2 error
    badRequest();
    //echoResJson();
    die();
}

// ISO2 is present and valid
// Check what info is requested, in order to build up multi_curl


// Check if info arg is present
if (!isset($_GET['info'])) {
    // Info arg error
    badRequest();
    //echoResJson();
    die();
}
$req_info = $_GET['info'];

// Split info string into array
$req_info_array_raw = explode(",", $req_info);

// start currency injection
// Check if currency arg is present
$currency_code = null;
$req_info_array = [];
foreach ($req_info_array_raw as $req_info) {
    $needle = "currency:";
    $needle_pos = strpos($req_info, $needle);
    if ($needle_pos === 0) {
        // Currency requested, parse
        $needle_len = strlen($needle);
        $currency_raw = substr($req_info, $needle_len);
        $currency_raw_len = strlen($currency_raw);
        if ($currency_raw_len === 3) {
            // Currency found in correct format
            $currency_code = strtoupper($currency_raw);
            array_push($req_info_array, 'currency');
        }
    } else {
        // Not currency, add anyway
        array_push($req_info_array, $req_info);
    }
}
// end currency injection

$req_info_array_count = count($req_info_array);

if ($req_info_array_count == 0) {
    // Info arg error
    badRequest();
    //echoResJson();
    die();
}


// Got array of info requests
// Check all are valid - pass through checking function of permitted values
$validated_info_array = infoReqsValid($req_info_array);
$validated_info_array_count = count($validated_info_array);

if ($validated_info_array_count == 0) {
    // Info arg error
    badRequest();
    //echoResJson();
    die();
}


// Got some valid info types to fetch ... from db, or external APIs


/*              Connect to database             */

// Check db conn (500)
// SQL DB connection variables
$host_name = file_get_contents('../keys/sqlhostname.txt');
$database = file_get_contents('../keys/sqldatabase.txt');
$user_name = file_get_contents('../keys/sqlusername.txt');
$password = file_get_contents('../keys/sqlpass.txt');

// Connection to DB
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn = null;
try {
    $conn = new mysqli($host_name, $user_name, $password, $database);
} catch (\Throwable $th) {
    // SQL conn error
    internalServer();
    die();
}

$iso2 = $conn->real_escape_string($iso2);
if (!is_null($currency_code)) $currency_code = $conn->real_escape_string($currency_code);

// SQL Success

/*              Check for client spamming               */

// Check IP for spamming (304)
$client_ip = "";
if (!isset($_SERVER['REMOTE_ADDR'])) {
    // IP not found, return 429 error
    clientSpam();
    die();
}
// Got IP
$client_ip = $_SERVER['REMOTE_ADDR'];

//$interval_start_end_obj = null;
$interval_start_end_obj = getStartAndEndOfCurrentIntervals();
// [ min, hour, day, mon ]
//   min = [start, end] etc

// Check db IP tables for too many requests
if (!is_null($interval_start_end_obj)) {
    $keys = ["mon", "day", "hour", "min"];
    
    $max_hits_for_interval_types = getMaxHitsForIntervalTypes($conn);
    
    if (is_null($max_hits_for_interval_types)) {
        // IP max allowable table not found, return 500 error
        internalServer();
        $conn->close();
        die();
    }
    
    
    // Loop through intervals and check db for too many IP
    foreach ($keys as $key) {
        if (!isset($max_hits_for_interval_types[$key])) {
            // Cannot find interval type from max allowable table
            continue;
        }
        $max_for_interval = $max_hits_for_interval_types[$key];
        if (!isset($interval_start_end_obj[$key])) {
            continue;
        }
        $start_end = $interval_start_end_obj[$key];
        $start_unix = $start_end[0];
        $ip_escaped = $conn->real_escape_string($client_ip);
        $user_is_spamming = isUserSpammingInterval($conn, $key, $max_for_interval, $start_unix, $client_ip);
        if ($user_is_spamming) {
            // Too many requests in at least one interval
            clientSpam();
            $conn->close();
            die();
        }
    }
}



/*              Check database for recent data              */

// User is not spamming, proceed with hitting info DB and/or external APIs

$res_data_objs = [];
/**
 * $res_data_objs: {
 *   wiki: {
 *     [data]
 *   },
 *   weather: { ... }
 * }
*/

// Array of info_type that need external API data
$get_ext = [];

// Try DB first
foreach ($validated_info_array as $info_type) {
    // info_type vals: wiki, weather, financial, people, currency
    switch ($info_type) {
        case 'wiki':
            $res_data_objs[$info_type] = getWikiDb($country_name);
            if (is_null($res_data_objs[$info_type])) {
                array_push($get_ext, $info_type);
            }
            break;
        case 'weather':
            $res_data_objs[$info_type] = getWeatherDb($iso2);
            if (is_null($res_data_objs[$info_type])) $res_data_objs[$info_type] = getWeatherExternal($iso2);
            break;
        case 'financial':
            $res_data_objs[$info_type] = getFinancialDb($iso2, $conn);
            if (is_null($res_data_objs[$info_type])) $res_data_objs[$info_type] = getFinancialExternal($iso2);
            break;
        case 'people':
            $get_data_db_res = getPeopleDb($iso2, $conn);
            // DB success, split data
            if (!is_null($get_data_db_res)) {
                if (isset($get_data_db_res['population'])) {
                    // Got population, split
                    $population = $get_data_db_res['population'];
                    unset($get_data_db_res['population']);
                    $res_data_objs['population'] = $population;
                }
                // Return data to user
                $res_data_objs[$info_type] = $get_data_db_res;
            }
            // Check if DB data is old, and needs refreshing from API
            if (is_null($get_data_db_res) || !isset($get_data_db_res['is_recent'])) {
                array_push($get_ext, $info_type);
            }
            // Remove is_recent flag
            if (!is_null($get_data_db_res)) {
                if (isset($get_data_db_res['is_recent'])) {
                    unset($get_data_db_res['is_recent']);
                }
            }
            break;
        case 'currency':
            $res_data_objs[$info_type] = getCurrencyDb($currency_code, $conn);
            break;
        case 'population':
            if (isset($res_data_objs[$info_type])) {
                // Already got population
                break;
            }
            $res_data_objs[$info_type] = getPopulationDb($iso2, $conn);
            break;
        default:
            break;
    }
}
// Should have all DB data, check for need for External API

// Generate multi cURL URLs
$urls = [];
foreach ($get_ext as $info_type) {
    // info_type vals: wiki, weather, financial, people, currency
    switch ($info_type) {
        case 'wiki':
            $wiki_url = genWikiUrl($country_name);
            array_push($urls, $wiki_url);
            break;
        case 'people':
            $people_url = genPeopleUrl($iso2);
            array_push($urls, $people_url);
            break;
        default:
            array_push($urls, null);
            break;
    }
}

// Build multi cURL request array
$chs = [];
$mh = curl_multi_init();
foreach ($urls as $url) {
    if (is_null($url)) {
        array_push($chs, null);
    } else {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_multi_add_handle($mh, $ch);
        array_push($chs, $ch);
    }
}

// Execute multi cURL
$api_responses = [];
if (count($chs) > 0) {
    // Execute, wait
    $running = null;
    do {
        curl_multi_exec($mh, $running);
    } while ($running);
    // Remove handles
    foreach ($chs as $ch) {
        curl_multi_remove_handle($mh, $ch);
    }
    // Close cURL
    curl_multi_close($mh);
    // Unpack responses
    foreach ($chs as $ch) {
        // Get res string
        if (is_null($ch)) {
            // Empty curl handlder
            array_push($api_responses, null);
        } else {
            // Should have response
            $curl_res = curl_multi_getcontent($ch);
            array_push($api_responses, $curl_res);
        }
    }
}

// Handle API responses
for ($i = 0; $i < count($get_ext); $i++) {
    // Get loop vals
    $info_type = $get_ext[$i];
    $api_res = $api_responses[$i];
    // Skip empty
    if (is_null($api_res)) continue;
    // Handle each type
    switch ($info_type) {
        case 'wiki':
            parseWikiExternal($api_res);
            break;
        case 'people':
            parsePeopleExternal($api_res, $conn, $iso2);
            break;
        default:
            break;
    }
}
// Should have all data, either from DB or External API

/*              Return data             */
$result_arr['data'] = $res_data_objs;
echoResJson();

$conn->close();
die();



/*      Methods     */

// Output results in JSON format back to user
// : VOID
function echoResJson()
{
    global $result_arr;
    $json = json_encode($result_arr, JSON_UNESCAPED_UNICODE);
    // Zip
    $http_accept_encoding = "";
    $accept_encoding = "";
    if (isset($_SERVER['HTTP_ACCEPT_ENCODING'])) $http_accept_encoding = $_SERVER['HTTP_ACCEPT_ENCODING'];
    if (isset($_SERVER['ACCEPT_ENCODING'])) $accept_encoding = $_SERVER['ACCEPT_ENCODING'];
    $supportsGzip = strpos($http_accept_encoding, 'gzip') || strpos($accept_encoding, 'gzip');
    if ($supportsGzip) {
        $json = gzencode($json);
        // Set Headers
        $headerZip = 'Content-Encoding: gzip';
        header($headerZip);
        $headerVary = 'Vary: Accept-Encoding';
        header($headerVary);
    }
    echo $json;
}

// Check if ISO2 code is valid, and return corresponding country name
// : string || null || false
function iso2ToCountryName($iso2)
{
    $isos_json_string = file_get_contents('../../json/country-isos.json');
    $country_names_string = file_get_contents('../../json/countryarray.json');
    // Parse JSON
    $iso_object = json_decode($isos_json_string, true);
    $country_names_array = json_decode($country_names_string);
    // Parse check
    $iso_error = is_null($iso_object) || $iso_object == false ;
    $country_error = is_null($country_names_array) || $country_names_array == false;
    if ($iso_error || $country_error) {
        // Couldn't parse json as array for haystack
        return null;
    }
    $iso2_array = $iso_object['iso2'];
    $index = array_search($iso2, $iso2_array);
    if ($index == false) {
        // Edge case: ISO not found
        return false;
    }
    $array_len = count($country_names_array);
    if ($index >= $array_len) {
        // Edge case, index out of bounds
        return false;
    }
    $country_name = $country_names_array[$index];
    return $country_name;
}

// Return only valid info request strings
// : [string]
function infoReqsValid($req_info_array)
{
    $valid_info_types = [];
    $haystack = ["wiki", "weather", "financial", "people", "currency", "population"];

    foreach ($req_info_array as $req_type) {
        $needle = strtolower($req_type);
        $is_found = in_array($needle, $haystack);
        if ($is_found) {
            array_push($valid_info_types, $needle);
        }
    }
    return $valid_info_types;
}


// Get the maximum allowable IP hits for a interval types
// : { mon: int, day: int, hour: int, min: int }
function getMaxHitsForIntervalTypes($conn)
{
    $field_names = 'interval_type, interval_max';
    $table_name = 'ip_hit_info_max';
    $ip_hit_max_sql =
    "SELECT ${field_names}
    FROM ${table_name};"
    ;

    $result = $conn->query($ip_hit_max_sql);

    // Check if there are any hits for IP in that interval range
    if ($result->num_rows == 0) {
        // Error, no rows found
        return null;
    } else {
        // Success, parse output and return assoc array
        $interval_type_max = [];
        while($row = $result->fetch_assoc()) {
            if (!isset($row['interval_type'])) {
                // Row error
                return null;
            }
            if (!isset($row['interval_max'])) {
                // Row error
                return null;
            }
            // Row data success
            $interval_type = $row['interval_type'];
            $interval_max = intval($row['interval_max']);
            $interval_type_max[$interval_type] = $interval_max;
        }
        // Success
        return $interval_type_max;
    }
}


// Check DB for user's IP to prevent spamming
// : BOOLEAN
function isUserSpammingInterval(
    $conn,
    $interval_type_key,
    $max_for_interval,
    $start_unix,
    $client_ip
) {
    // Clear old data first
    $table_name = 'ip_hit_info';

    // Generate SQL query
    $field_names = 'id, interval_count';
    $ip_hit_info_sql =
    "SELECT ${field_names}
    FROM ${table_name}
    WHERE ip_address = '${client_ip}'
    AND start_unix = ${start_unix};"
    ;
    $result = $conn->query($ip_hit_info_sql);

    // Check if there are any hits for IP in that interval range
    if ($result->num_rows > 1) {
        // Error, should never be multiple entries for given IP and start_unix
        return true;
    } elseif ($result->num_rows == 1) {
        // There are hits
        // Check if at max
        //  if max, return true
        //  if below max, increment value, return false
        $row = $result->fetch_assoc();

        if (!isset($row["interval_count"])) {
            // Error with fetched row
            return true;
        }

        $interval_count = $row["interval_count"];
        if ($interval_count >= $max_for_interval) {
            // Spamming
            return true;
        }

        // Increment interval_count
        if (!isset($row["id"])) {
            // Error with fetched row
            return true;
        }
        // Gen data
        $id = $row["id"];
        $new_interval_count = $interval_count + 1;

        // SQL update/PUT query
        $sql_put = 
        "UPDATE ${table_name}
        SET interval_count = ${new_interval_count}
        WHERE id = ${id};"
        ;
        // Execute SQL query
        $put_result = $conn->query($sql_put);

        // User can proceed with request
        return false;
    } else {
        // No hits for interval, instantiate IP with 1 hit, return false
        $sql_post = 
        "INSERT INTO ${table_name} (ip_address, interval_type, start_unix, interval_count) 
        VALUES ('${client_ip}', '${interval_type_key}', ${start_unix}, 1);"
        ;
        $post_result = $conn->query($sql_post);
        return false;
    }
}


/*              Fetch from DB               */


// Fetch Wiki data from DB
// : { ... } || null
function getWikiDb($iso2)
{
    // Not yet available
    // Use Geonames external API
    return null;
}

// Fetch Weather data from DB
// : { ... } || null
function getWeatherDb($iso2)
{
    // Implement cache later
    return null;
}

// Fetch Financial data from DB
// : { ... } || null
function getFinancialDb($iso2, $conn)
{
    $iso = $iso2;
    // Get GDP
    $table_name = 'people_data';
    $get_sql =
    "SELECT gdp_mil_usd
    FROM ${table_name}
    WHERE iso = '${iso}';"
    ;
    $result = $conn->query($get_sql);

    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        $rtn_obj = [];
        $gdp = $row['gdp_mil_usd'];
        if (!is_null($gdp)) $gdp = intval($gdp);
        $rtn_obj['gdpMil'] = $gdp;
        return $rtn_obj;
    }
}

// Fetch People data from DB
// : { ... } || null
function getPeopleDb($iso, $conn)
{
    // Get GDP
    $table_name = 'people_data';

    $fields = [
        'population',
        'area_km',
        'migrants_net',
        'age_median',
        'gdp_mil_usd',
        'urban_pc',
        'calling_code',
        'currency_code',
        'other_currency_codes',
        'flag_url',
        'languages_csv'
    ];

    $rtn_keys = [
        'population',
        'areaKm',
        'migrantsNet',
        'ageMedian',
        'gdpMil',
        'urbanPc',
        'callingCode',
        'currencyCode',
        'otherCurrencyCodes',
        'flagUrl',
        'languagesCsv'
    ];

    $data_types = [
        'i',
        'i',
        'i',
        'i',
        'i',
        'i',
        '',
        '',
        '',
        '',
        ''
    ];

    $fields_string = implode(', ', $fields);

    $get_sql =
    "SELECT ${fields_string}, unix_day_modified
    FROM ${table_name}
    WHERE iso = '${iso}';"
    ;
    $result = $conn->query($get_sql);

    $current_time = time();
    $current_unix_day = floor($current_time / 86400);
    $unix_day_7_days_ago = $current_unix_day - 7;

    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        $rtn_obj = [];
        // Unpack to JS camelCase
        for ($i = 0; $i < count($fields); $i++) {
            $field = $fields[$i];
            $rtn_key = $rtn_keys[$i];
            // Skip missing response keys
            if (!isset($row[$field])) continue;
            $rtn_val = $row[$field];
            // Skip null or empty vals
            if (is_null($rtn_val) || $rtn_val == "") continue;
            // Cast
            $cast = $data_types[$i];
            switch ($cast) {
                case 'i':
                    $rtn_val = intval($rtn_val);
                    break;
            }
            // return
            $rtn_obj[$rtn_key] = $rtn_val;
        }
        // handle unix_day_modified
        if (isset($row['unix_day_modified'])) {
            $unix_day_modified = $row['unix_day_modified'];
            if ($unix_day_modified > $unix_day_7_days_ago) {
                $rtn_obj['is_recent'] = true;
                //$rtn_obj['is_recent'] = null;
            }
        }
        
        return $rtn_obj;
    }
    // Error
    return null;
}

// Fetch currency data from DB
// : { current: {r: rateFloat, t: unixInt}, days: [ {t,l,o,c,h}, {...}, ... ] } || null
function getCurrencyDb($currency_code, $conn)
{
    $currency_code_escaped = $conn->real_escape_string($currency_code);
    $current_time = time();
    $current_unix_day = floor($current_time / 86400);
    $unix_day_14days_ago = $current_unix_day - 14;
 
    // Generate SQL query
    $field_names = 'unix_day, r_o, r_l, r_h, r_c';
    $table_name = 'oxr_data_historical';
    $get_sql =
    "SELECT ${field_names}
    FROM ${table_name}
    WHERE currency_code = '${currency_code_escaped}'
    AND unix_day >= ${unix_day_14days_ago};"
    ;
    $result = $conn->query($get_sql);

    if ($result->num_rows > 1) {
        // Gen return obj
        $rtn_obj = [];
        // Get unix from 14 days agp
        //$init_time = $unix_day_14days_ago * 86400;
        // Var for each day
        $days = [];
        // Loop through days
        while($row = $result->fetch_assoc()) {
            $day = [];
            $day['t'] = intval($row['unix_day']);
            $day['l'] = floatval($row['r_l']);
            $day['o'] = floatval($row['r_o']);
            $day['c'] = floatval($row['r_c']);
            $day['h'] = floatval($row['r_h']);
            array_push($days, $day);
        }
        $rtn_obj['days'] = $days;

        // Get current
        $one_hour_ago = $current_time - 3600;
        // temp
        $one_hour_ago = $current_time - 172800;
        // Generate SQL query
        $current_sql =
        "SELECT rate, unix
        FROM oxr_data_current
        WHERE currency_code = '${currency_code_escaped}'
        AND unix >= ${one_hour_ago}
        ORDER BY unix DESC
        LIMIT 1;"
        ;
        $current_result = $conn->query($current_sql);

        if ($current_result->num_rows > 0) {
            // Get row
            $row = $current_result->fetch_assoc();
            // Unpack
            $latest_rate = $row['rate'];
            $unix = intval($row['unix']);
            // Assign to return obj
            $current_obj = [];
            $current_obj['r'] = floatval($latest_rate);
            $current_obj['t'] = $unix;
            $rtn_obj['current'] = $current_obj;
        }
        // Finished
        return $rtn_obj;
    }
    return [];
}

function getPopulationDb($iso2, $conn)
{
    // Generate SQL query
    $field_names = 'population';
    $table_name = 'people_data';
    $get_sql =
    "SELECT ${field_names}
    FROM ${table_name}
    WHERE iso = '${iso2}';"
    ;
    $result = $conn->query($get_sql);

    if ($result->num_rows == 1) {
        // Get row
        $row = $result->fetch_assoc();
        // Unpack
        $population = intval($row['population']);
        // Finished
        return $population;
    }
    return null;
}



/*              Fetch from External API             */


function genWikiUrl($country_name)
{
    $api_key = file_get_contents('../keys/geonames.txt');
    $country_url_escape = urlencode($country_name);

    $url = "http://api.geonames.org/wikipediaSearchJSON?q=${country_url_escape}&title=${country_url_escape}&maxRows=10&username=${api_key}";
    return $url;
}

// Fetch Wiki From External API
// : [ {sum, w_url, t_url, (w_flag, t_flag)}, ... ] || []
// Parse API response string, save to global rtn var
function parseWikiExternal($response)
{
    function _stringClean($string) {
        $string = str_replace(['-', '_'], '', $string); // Deletes all hyphens and underscores
        return preg_replace('/[^A-Za-z0-9\-]/', '', $string); // Removes special chars. 
    }

    global $res_data_objs;
    global $country_name;

    // Overwrite wiki obj
    $responseArray = json_decode($response, true);

    // Parse response
    $geonames_array = $responseArray['geonames'];

    // Return array
    $valid_entries = [];

    // If no thumbnail entry is found on the primary entry
    $just_waiting_on_thumbnail = false;
    $backup_thumbnail = "";
    $backup_thumbnail_long_flag = true;

    // Getting wiki url
    $url_prefix = "en.wikipedia.org/wiki/";
    $url_prefix_len = strlen($url_prefix);

    // Getting img url
    $img_prefix = "http://www.geonames.org/img/wikipedia/";
    $img_prefix_len = strlen($img_prefix);

    // Loop through API response lines
    foreach ($geonames_array as $entry) {

        // thumbail_url
        $key = 'thumbnailImg';
        $thumbnail_url = "";
        $thumbnail_url_is_long = true;
        if (isset($entry[$key])) {
            $thumbnail_url = $entry[$key];
            $thumb_url_len = strlen($thumbnail_url);
            if ($thumb_url_len > $img_prefix_len) {
                // Might be able to shorten
                $thumb_start = substr($thumbnail_url, 0, $img_prefix_len);
                if ($thumb_start == $img_prefix) {
                    // Can remove reused prefix and generate client-side
                    $thumbnail_url = substr($thumbnail_url, $img_prefix_len);
                    $thumbnail_url_is_long = false;
                }
            }
            if ($backup_thumbnail == "") {
                // Set a backup thumbnail, in case primary entry has none
                $backup_thumbnail = $thumbnail_url;
                $backup_thumbnail_long_flag = $thumbnail_url_is_long;
            }
        }

        // Edge case where we have found primary result, but are looping just to extract a relevant thumbnail URL
        if ($just_waiting_on_thumbnail == true) {
            if ($thumbnail_url == "") {
                continue;
            } else {
                $valid_entries[0]["t_url"] = $thumbnail_url;
                if ($thumbnail_url_is_long == true)  {
                    $valid_entries[0]["t_flag"] = true;
                } else {
                    unset($valid_entries[0]["t_flag"]);
                }
                break;
            }
        }

        // summary
        $key = 'summary';
        if (!isset($entry[$key])) {
            continue;
        }
        $summary = $entry[$key];

        // wiki_url
        $key = 'wikipediaUrl';
        if (!isset($entry[$key])) {
            continue;
        }
        $wiki_url = $entry[$key];
        $url_end = $wiki_url;
        $url_len = strlen($url_end);
        $wiki_url_is_long = true;
        if ($url_len > $url_prefix_len) {
            // Might be able to shorten
            $url_start = substr($wiki_url, 0, $url_prefix_len);
            if ($url_start == $url_prefix) {
                // Shorten and add prefix server size
                $url_end = substr($wiki_url, $url_prefix_len);
                $wiki_url_is_long = false;
            }
        }
        $url_end_lower = strtolower($url_end);
        $country_lower = strtolower($country_name);
        $url_end_clean = _stringClean($url_end_lower);
        $country_clean = _stringClean($country_lower);
        $url_end_matches_country_name = $url_end_clean == $country_clean;

        if ($url_end_matches_country_name == false) {
            // Edge cases like "the_bahamas" => "bahamas"
            $url_end_lower_no_the = str_replace(["the-", "the_"], "", $url_end_lower);
            $url_end_lower_no_the_clean = _stringClean($url_end_lower_no_the);
            $url_end_matches_country_name = $url_end_lower_no_the_clean == $country_clean;

            if ($url_end_matches_country_name == false) {
                // Edge cases like "georgia_(country)" => "georgia"
                $url_end_lower_no_the_clean_no_bracket_country = str_replace("28country29", "", $url_end_lower_no_the_clean);
                $url_end_matches_country_name = $url_end_lower_no_the_clean_no_bracket_country == $country_clean;
            }
        }
        
        $valid_entry = [];
        $valid_entry['sum'] = $summary;
        $valid_entry['w_url'] = $url_end;
        $valid_entry['t_url'] = $thumbnail_url;
        if ($wiki_url_is_long == true) {
            $valid_entry["w_flag"] = true;
        }
        if ($thumbnail_url_is_long == true) {
            $valid_entry["t_flag"] = true;
        }
        
        array_push($valid_entries, $valid_entry);
        
        if ($url_end_matches_country_name) {
            // Certain a match has been found, clear return array and place just this one inside
            $valid_entries = [$valid_entry];
            if ($thumbnail_url != "") {
                // All fields populated, no need to continue looping
                break;
            } else {
                // Thumbnail missing
                if ($backup_thumbnail != "") {
                    // Use already-found backup
                    $valid_entries[0]['t_url'] = $backup_thumbnail;
                    if ($backup_thumbnail_long_flag == true) {
                        $valid_entries[0]['t_flag'] = true;
                    } else {
                        unset($valid_entries[0]["t_flag"]);
                    }
                    break;
                } else {
                    // Try and wait until another comes available
                    $just_waiting_on_thumbnail = true;
                }
            }
        }

    } // End of responses loop

    $res_data_objs['wiki'] = $valid_entries;
}


// Fetch Weather From External API
// : [ {}, ... ] || []
function getWeatherExternal($iso2)
{
    // Get lat/lng of Capital to use
    // If no capital, use top populated city... or get country lat/lng from another table (rest countries?) to use
    /* Methods */
    function _getCapitalWeather($iso2) {
        function _parseWeatherOneCall($response_array) {
            $rtn_obj = [];
            
            // Current
            if (isset($response_array['current'])) {
                $rtn_current = [];
                $current = $response_array['current'];
                // Sun rise/set
                if (isset($current['sunrise'])) {
                    $sunrise = $current['sunrise'];
                    $seconds = $sunrise % 86400;
                    $minute = round($seconds / 60, 0, PHP_ROUND_HALF_UP);
                    $rtn_obj['r'] = $minute;
                }
                if (isset($current['sunset'])) {
                    $sunset = $current['sunset'];
                    $seconds = $sunset % 86400;
                    $minute = round($seconds / 60, 0, PHP_ROUND_HALF_UP);
                    $rtn_obj['s'] = $minute;
                }
                // Weather
                if (isset($current['weather'])) {
                    $weather_array = $current['weather'];
                    // Weather summary
                    if (count($weather_array) > 0) {
                        $weather = $weather_array[0];
                        $summary = [];
                        // Id
                        if (isset($weather['id'])) {
                            $weather_id = $weather['id'];
                            $summary['i'] = $weather_id;
                        }
                        // Title
                        if (isset($weather['main'])) {
                            $weather_title = $weather['main'];
                            $summary['t'] = $weather_title;
                        }
                        // Desc
                        if (isset($weather['description'])) {
                            $weather_description = $weather['description'];
                            $summary['d'] = $weather_description;
                        }
                        // Icon
                        if (isset($weather['icon'])) {
                            $weather_icon = $weather['icon'];
                            $summary['c'] = $weather_icon;
                        }
                        // Save data to return object
                        $rtn_current['y'] = $summary;
                    }
                }
                // Temps
                $temps = [];
                if (isset($current['temp'])) {
                    $temp = $current['temp'];
                    $temps['t'] = $temp;
                }
                // Feels
                if (isset($current['feels_like'])) {
                    $feels = $current['feels_like'];
                    $temps['f'] = $feels;
                }
                $rtn_current['t'] = $temps;
                // Pressure
                if (isset($current['pressure'])) {
                    $pressure = $current['pressure'];
                    $rtn_current['p'] = $pressure;
                }
                // Humidity
                if (isset($current['humidity'])) {
                    $humid = $current['humidity'];
                    $rtn_current['h'] = $humid;
                }
                // Visibility
                if (isset($current['visibility'])) {
                    $visibility = $current['visibility'];
                    $rtn_current['v'] = $visibility;
                }
                // UV
                if (isset($current['uvi'])) {
                    $uvi = $current['uvi'];
                    $rtn_current['u'] = $uvi;
                }
                // Wind
                $wind = [];
                // Speed
                if (isset($current['wind_speed'])) {
                    $speed = $current['wind_speed'];
                    $wind['s'] = $speed;
                }
                // Deg
                if (isset($current['wind_deg'])) {
                    $deg = $current['wind_deg'];
                    $wind['d'] = $deg;
                }
                $rtn_current['w'] = $wind;
                // Clouds
                if (isset($current['clouds'])) {
                    $clouds = $current['clouds'];
                    $rtn_current['c'] = $clouds;
                }
                // Rain
                if (isset($response_array['rain'])) {
                    $rain = $response_array['rain'];
                    if (isset($rain['1h'])) {
                        $r1h = $rain['1h'];
                        $rtn_current['r'] = $r1h;
                    }
                }
                // Snow
                if (isset($response_array['snow'])) {
                    $snow = $response_array['snow'];
                    if (isset($snow['1h'])) {
                        $s1h = $snow['1h'];
                        $rtn_current['s'] = $s1h;
                    }
                }
                $rtn_obj['c'] = $rtn_current;
            }
        
            // Hourly
            if (isset($response_array['hourly'])) {
                $hourly_array = $response_array['hourly'];
                $hours = [];
                foreach ($hourly_array as $hourly) {
                    $hour = [];
                    // Time
                    if (isset($hourly['dt'])) {
                        $dt = $hourly['dt'];
                        $seconds = $dt % 86400;
                        $hr = round($seconds / 3600, 0, PHP_ROUND_HALF_DOWN);
                        $hour['x'] = $hr;
                    }
                    // Temps
                    $temps = [];
                    if (isset($hourly['temp'])) {
                        $temp = $hourly['temp'];
                        $temps['t'] = $temp;
                    }
                    // Feels
                    if (isset($hourly['feels_like'])) {
                        $feels_like = $hourly['feels_like'];
                        $temps['f'] = $feels_like;
                    }
                    $hour['t'] = $temps;
                    // Others
                    // Pressure
                    if (isset($hourly['pressure'])) {
                        $pressure = $hourly['pressure'];
                        $hour['p'] = $pressure;
                    }
                    // Humidity
                    if (isset($hourly['humidity'])) {
                        $humid = $hourly['humidity'];
                        $hour['h'] = $humid;
                    }
                    // Visibility
                    if (isset($hourly['visibility'])) {
                        $visibility = $hourly['visibility'];
                        $hour['v'] = $visibility;
                    }
                    // UV
                    if (isset($hourly['uvi'])) {
                        $uvi = $hourly['uvi'];
                        $hour['u'] = $uvi;
                    }
                    // Wind
                    $wind = [];
                    // Speed
                    if (isset($hourly['wind_speed'])) {
                        $speed = $hourly['wind_speed'];
                        $wind['s'] = $speed;
                    }
                    // Deg
                    if (isset($hourly['wind_deg'])) {
                        $deg = $hourly['wind_deg'];
                        $wind['d'] = $deg;
                    }
                    $hour['w'] = $wind;
                    // Clouds
                    if (isset($hourly['clouds'])) {
                        $clouds = $hourly['clouds'];
                        if (isset($clouds['all'])) {
                            $all = $hourly['all'];
                            $hour['c'] = $all;
                        }
                    }
                    // Rain
                    if (isset($hourly['rain'])) {
                        $rain = $hourly['rain'];
                        if (isset($rain['1h'])) {
                            $r1h = $rain['1h'];
                            $hour['r'] = $r1h;
                        }
                    }
                    // Snow
                    if (isset($hourly['snow'])) {
                        $snow = $hourly['snow'];
                        if (isset($snow['1h'])) {
                            $s1h = $snow['1h'];
                            $hour['s'] = $s1h;
                        }
                    }
                    // Weather summary
                    if (isset($hourly['weather'])) {
                        $weather_array = $hourly['weather'];
                        // Weather summary
                        if (count($weather_array) > 0) {
                            $weather = $weather_array[0];
                            $summary = [];
                            // Id
                            if (isset($weather['id'])) {
                                $weather_id = $weather['id'];
                                $summary['i'] = $weather_id;
                            }
                            // Title
                            if (isset($weather['main'])) {
                                $weather_title = $weather['main'];
                                $summary['t'] = $weather_title;
                            }
                            // Desc
                            if (isset($weather['description'])) {
                                $weather_description = $weather['description'];
                                $summary['d'] = $weather_description;
                            }
                            // Icon
                            if (isset($weather['icon'])) {
                                $weather_icon = $weather['icon'];
                                $summary['c'] = $weather_icon;
                            }
                            // Save data to return object
                            $hour['y'] = $summary;
                        }
                    }
                    // POP
                    if (isset($hourly['pop'])) {
                        $pop = $hourly['pop'];
                        $hour['o'] = $pop;
                    }
                    array_push($hours, $hour);
                    if (count($hours) >= 24) break;
                }
                $rtn_obj['h'] = $hours;
            }
        
            // Daily
            if (isset($response_array['daily'])) {
                $daily_array = $response_array['daily'];
                $days = [];
                foreach ($daily_array as $daily) {
                    $day = [];
                    // Unix day
                    if (isset($daily['dt'])) {
                        $dt = $daily['dt'];
                        $unix_day = round($dt / 86400, 0, PHP_ROUND_HALF_DOWN);
                        $day['x'] = $unix_day;
                    }
                    // Sun Rise/Set
                    $sun = [];
                    if (isset($daily['sunrise'])) {
                        $sunrise = $daily['sunrise'];
                        $seconds = $sunrise % 86400;
                        $minute = round($seconds / 60, 0, PHP_ROUND_HALF_UP);
                        $sun['r'] = $minute;
                    }
                    if (isset($daily['sunset'])) {
                        $sunset = $daily['sunset'];
                        $seconds = $sunset % 86400;
                        $minute = round($seconds / 60, 0, PHP_ROUND_HALF_UP);
                        $sun['s'] = $minute;
                    }
                    $day['a'] = $sun;
                    // Moon
                    $moon = [];
                    if (isset($daily['moonrise'])) {
                        $moonrise = $daily['moonrise'];
                        $seconds = $moonrise % 86400;
                        $minute = round($seconds / 60, 0, PHP_ROUND_HALF_UP);
                        $moon['r'] = $minute;
                    }
                    if (isset($daily['moonset'])) {
                        $moonset = $daily['moonset'];
                        $seconds = $moonset % 86400;
                        $minute = round($seconds / 60, 0, PHP_ROUND_HALF_UP);
                        $moon['s'] = $minute;
                    }
                    if (isset($daily['moon_phase'])) {
                        $moon_phase = $daily['moon_phase'];
                        $moon['p'] = $moon_phase;
                    }
                    $day['m'] = $moon;
        
                    // Temps
                    $temps = [];
                    if (isset($daily['temp'])) {
                        $temp = $daily['temp'];
                        if (isset($temp['min'])) {
                            $min = $temp['min'];
                            $temps['l'] = $min;
                        }
                        if (isset($temp['morn'])) {
                            $morn = $temp['morn'];
                            $temps['m'] = $morn;
                        }
                        if (isset($temp['day'])) {
                            $tDay = $temp['day'];
                            $temps['d'] = $tDay;
                        }
                        if (isset($temp['eve'])) {
                            $eve = $temp['eve'];
                            $temps['e'] = $eve;
                        }
                        if (isset($temp['night'])) {
                            $night = $temp['night'];
                            $temps['n'] = $night;
                        }
                        if (isset($temp['max'])) {
                            $max = $temp['max'];
                            $temps['h'] = $max;
                        }
                    }
                    $day['t'] = $temps;
        
                    // Feels
                    $feels = [];
                    if (isset($daily['feels_like'])) {
                        $feels = $daily['feels_like'];
                        if (isset($feels['morn'])) {
                            $morn = $feels['morn'];
                            $feels['m'] = $morn;
                        }
                        if (isset($feels['day'])) {
                            $tDay = $feels['day'];
                            $feels['d'] = $tDay;
                        }
                        if (isset($feels['eve'])) {
                            $eve = $feels['eve'];
                            $feels['e'] = $eve;
                        }
                        if (isset($feels['night'])) {
                            $night = $feels['night'];
                            $feels['n'] = $night;
                        }
                    }
                    $day['f'] = $feels;
        
                    // Others
                    // Pressure
                    if (isset($daily['pressure'])) {
                        $pressure = $daily['pressure'];
                        $day['p'] = $pressure;
                    }
                    // Humidity
                    if (isset($daily['humidity'])) {
                        $humid = $daily['humidity'];
                        $day['h'] = $humid;
                    }
                    // UV
                    if (isset($daily['uvi'])) {
                        $uvi = $daily['uvi'];
                        $day['u'] = $uvi;
                    }
                    // Wind
                    $wind = [];
                    // Speed
                    if (isset($daily['wind_speed'])) {
                        $speed = $daily['wind_speed'];
                        $wind['s'] = $speed;
                    }
                    // Deg
                    if (isset($daily['wind_deg'])) {
                        $deg = $daily['wind_deg'];
                        $wind['d'] = $deg;
                    }
                    $day['w'] = $wind;
                    // Clouds
                    if (isset($daily['clouds'])) {
                        $clouds = $daily['clouds'];
                        if (isset($clouds['all'])) {
                            $all = $daily['all'];
                            $day['c'] = $all;
                        }
                    }
                    // Rain
                    if (isset($daily['rain'])) {
                        $rain = $daily['rain'];
                        $day['r'] = $rain;
                    }
                    // Snow
                    if (isset($daily['snow'])) {
                        $snow = $daily['snow'];
                        $day['s'] = $snow;
                    }
                    // Weather summary
                    if (isset($daily['weather'])) {
                        $weather_array = $daily['weather'];
                        // Weather summary
                        if (count($weather_array) > 0) {
                            $weather = $weather_array[0];
                            $summary = [];
                            // Id
                            if (isset($weather['id'])) {
                                $weather_id = $weather['id'];
                                $summary['i'] = $weather_id;
                            }
                            // Title
                            if (isset($weather['main'])) {
                                $weather_title = $weather['main'];
                                $summary['t'] = $weather_title;
                            }
                            // Desc
                            if (isset($weather['description'])) {
                                $weather_description = $weather['description'];
                                $summary['d'] = $weather_description;
                            }
                            // Icon
                            if (isset($weather['icon'])) {
                                $weather_icon = $weather['icon'];
                                $summary['c'] = $weather_icon;
                            }
                            // Save data to return object
                            $day['y'] = $summary;
                        }
                    }
                    // POP
                    if (isset($daily['pop'])) {
                        $pop = $daily['pop'];
                        $day['o'] = $pop;
                    }
                    array_push($days, $day);
                }
                $rtn_obj['d'] = $days;
            }
        
            // Alerts
            if (isset($response_array['alerts'])) {
                $alerts = $response_array['alerts'];
                $rtn_alerts = [];
                foreach ($alerts as $alert_array) {
                    $rtn_alert = [];
                    if (isset($alert_array['start'])) {
                        $start = $alert_array['start'];
                        $rtn_alert['s'] = $start;
                    }
                    if (isset($alert_array['end'])) {
                        $end = $alert_array['end'];
                        $rtn_alert['e'] = $end;
                    }
                    if (isset($alert_array['event'])) {
                        $event = $alert_array['event'];
                        $rtn_alert['v'] = $event;
                    }
                    if (isset($alert_array['description'])) {
                        $description = $alert_array['description'];
                        $rtn_alert['d'] = $description;
                    }
                    if (isset($alert_array['tags'])) {
                        $tags = $alert_array['tags'];
                        $rtn_alert['t'] = $tags;
                    }
                    array_push($rtn_alerts, $rtn_alert);
                }
                $rtn_obj['a'] = $rtn_alerts;
            }
        
            // Finished
            return $rtn_obj;
        }
        
        // Main
        $capitals_path = '../../json/capital-latlng.json';
        $capitals_string = file_get_contents($capitals_path);
        if (is_null($capitals_string)) return [];
        if ($capitals_string == "") return [];
        $capitals_assoc = json_decode($capitals_string, true);
        if (!isset($capitals_assoc[$iso2])) return [];
        $capital_obj = $capitals_assoc[$iso2];
        //if (!isset($capital_obj['cap'])) return [];
        //$city_name = $capital_obj['cap'];
        if (!isset($capital_obj['latlng'])) return [];
        $latlng = $capital_obj['latlng'];
        if (count($latlng) < 2) return [];
        $lat = $latlng[0];
        $lng = $latlng[1];
        // Data intact

        // Get API key
        $api_key_path = "../keys/openweather.txt";
        $api_key = file_get_contents($api_key_path);
        if (is_null($api_key)) return [];
        if ($api_key == "") return [];

        // One Call vs Current
        //$url = "https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${api_key}&units=metric";
        $url = "https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lng}&exclude=minutely&appid=${api_key}&units=metric";

        //  cURL
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_URL, $url);

        $response = curl_exec($ch);
        $response_array = json_decode($response, true);

        // Parse response
        $parsed_response = _parseWeatherOneCall($response_array);
        // Return object
        return $parsed_response;
    }
    
    // Try capital
    $capital_weather = _getCapitalWeather($iso2);
    if (count($capital_weather) > 0) return $capital_weather;

    // Error
    return [];
}

// Fetch Financial From External API
// : [ {}, ... ] || []
function getFinancialExternal($iso2)
{
    // No external API currently for consideration
    return null;
}

function genPeopleUrl($iso2)
{
    $req_keys = ['currencies', 'idd', 'area', 'population', 'flags'];
    $fields = implode(',', $req_keys);
    $url = "https://restcountries.com/v3.1/alpha/${iso2}?fields=${fields}";
    return $url;
}

// Fetch OtherData From External API
// : [ {}, ... ] || []
function parsePeopleExternal($response, $conn, $iso2)
{
    global $res_data_objs;

    $response_array = json_decode($response, true);

    // Update db vars
    $db_keys = [];
    $db_vals = [];

    // Calling code
    if (isset($response_array['idd'])) {
        $idd = $response_array['idd'];
        $calling_code = "";
        if (isset($idd['root'])) {
            $root = $idd['root'];
            if (isset($idd['suffixes'])) {
                $suffixes = $idd['suffixes'];
                if (isset($suffixes[0])) {
                    $suffix = $suffixes[0];
                    $calling_code = $root . $suffix;
                    $calling_code = $conn->real_escape_string($calling_code);
                    if ($calling_code !== "") {
                        // JSON
                        if (str_starts_with($calling_code, "+")) $calling_code = substr($calling_code, 1);
                        $res_data_objs['people']['callingCode'] = $calling_code;
                        // DB
                        array_push($db_keys, 'calling_code');
                        array_push($db_vals, "'${calling_code}'");
                    }
                }
            }
        }
    }
    // Area
    if (isset($response_array['area'])) {
        $res_string = $response_array['area'];
        $area = intval($res_string);
        // JSON
        $res_data_objs['people']['areaKm'] = $area;
        // DB
        array_push($db_keys, 'area_km');
        array_push($db_vals, $area);
    }
    // Population
    if (isset($response_array['population'])) {
        $res_string = $response_array['population'];
        $population = intval($res_string);
        // JSON
        $res_data_objs['population'] = $population;
        // DB
        array_push($db_keys, 'population');
        array_push($db_vals, $population);
    }
    // Flag
    if (isset($response_array['flags'])) {
        $flags = $response_array['flags'];
        $url = "";
        // Get url
        if (isset($flags['svg'])) {
            $url = $flags['svg'];
        } elseif (isset($flags['png'])) {
            $url = $flags['png'];
        }
        if ($url !== "") {
            // Trim off prefix
            $prefix = "https://flagcdn.com/";
            $can_trim = str_starts_with($url, $prefix);
            if ($can_trim) {
                $url = substr($url, strlen($prefix));
            }
            $url = $conn->real_escape_string($url);
            if ($url !== "") {
                // JSON
                $res_data_objs['people']['flagUrl'] = $url;
                // DB
                array_push($db_keys, 'flag_url');
                array_push($db_vals, "'${url}'");
            }
        }
    }

    $current_time = time();
    $current_unix_day = floor($current_time / 86400);

    array_push($db_keys, 'unix_day_modified');
    array_push($db_vals, $current_unix_day);

    // Update DB
    $sql_fields = [];
    for ($i = 0; $i < count($db_keys); $i++) {
        $db_key = $db_keys[$i];
        $db_val = $db_vals[$i];
        $sql_field = "${db_key} = ${db_val}";
        array_push($sql_fields, $sql_field);
    }
    $sql_field_string = implode(', ', $sql_fields);
    $sql_put = 
    "UPDATE people_data
    SET ${sql_field_string}
    WHERE iso = '${iso2}';"
    ;
    $put_result = $conn->query($sql_put);
}

/* 4xx Client error */
function badRequest()
{
    $code = 400;
    http_response_code($code);
}
function clientSpam()
{
    $code = 429;
    http_response_code($code);
}
/* 5xx Server error */
function internalServer()
{
    $code = 500;
    http_response_code($code);
}
