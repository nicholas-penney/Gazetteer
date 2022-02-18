<?php

/*              Import libraries                */

function get_start_and_end_of_current_intervals() {
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
    $secs_in_minute = 60;
    $secs_in_hour = 3600;
    $secs_in_day = 86400;
    
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
    $min_end_unix = $min_start_unix + $secs_in_minute;
    $min_array = [$min_start_unix, $min_end_unix];

    // Hour
    $now_minutes_in_secs = $now_minutes * $secs_in_minute;
    $hour_start_unix = $now_unix - $now_minutes_in_secs - $now_seconds;
    $hour_end_unix = $hour_start_unix + $secs_in_hour;
    $hour_array = [$hour_start_unix, $hour_end_unix];

    // Day
    $days_since_epoch = floor($now_unix / $secs_in_day);
    $day_start_unix = $days_since_epoch * $secs_in_day;
    $day_end_unix = $day_start_unix + $secs_in_day;
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



// Check params
if (!isset($_GET['id'])) bad_request();
if (!isset($_GET['z'])) bad_request();
if (!isset($_GET['x'])) bad_request();
if (!isset($_GET['y'])) bad_request();

/*              Parse request               */
$id_raw = $_GET["id"];
$z_str = $_GET["z"];
$x_str = $_GET["x"];
$y_str = $_GET["y"];
// Convert/cast
$map_id = raw_to_map_id($id_raw);
$z = intval($z_str);
$x = intval($x_str);
$y = intval($y_str);
// Data integrity check
$xyz_strings = [$z_str, $x_str, $y_str];
$xyz_ints = [$z, $x, $y];
for($i=0;$i<count($xyz_ints);$i++) {
    $xyz_int = $xyz_ints[$i];
    $xyz_string = $xyz_strings[$i];
    if ($xyz_int == 0 && $xyz_string != "0") bad_request();
}
$provider = map_id_to_provider($map_id);
// Data parsed and cast
// Check DB

// Check IP for spamming (429)
$client_ip = "";
if (!isset($_SERVER['REMOTE_ADDR'])) {
    // IP not found, return 429 error
    client_spam();
}
// Got IP
$client_ip = $_SERVER['REMOTE_ADDR'];

/*              Connect to database             */

// Check db conn (500)
// SQL DB connection variables
$host_name = file_get_contents('../keys/sqlhostname.txt');
$database = file_get_contents('../keys/sqldatabase.txt');
$user_name = file_get_contents('../keys/sqlusername.txt');
$password = file_get_contents('../keys/sqlpass.txt');

// Connection to DB
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn = NULL;
try {
    $conn = new mysqli($host_name, $user_name, $password, $database);
} catch (\Throwable $th) {
    // SQL conn error
    internal_server();
}

$interval_start_end_obj = get_start_and_end_of_current_intervals();
// [ min, hour, day, mon ]
//   min = [start, end] etc

if (is_null($interval_start_end_obj)) {
    // Data integrity check
    $conn->close();
    internal_server();
}

// Check db IP tables for too many requests
$interval_keys = ["mon", "day", "hour", "min"];
    
$max_hits_for_interval_types = get_max_hits_for_interval_types($conn, $provider);
// { mon: int, day: int, hour: int, min: int }

if (is_null($max_hits_for_interval_types)) {
    // IP max allowable table not found, return 500 error
    $conn->close();
    internal_server();
}

// Get interval values for user's IP
$client_counts = get_user_interval_counts($conn, $provider, $client_ip);
$intervals_to_add = [];
$id_and_new_vals = [];
$id_and_start_unix_to_resets = [];

$too_many_requests = FALSE;

// Loop through intervals and check db for too many IP
foreach($interval_keys as $interval_type) {
    $current_start_end = $interval_start_end_obj[$interval_type];
    $current_start_unix = $current_start_end[0];
    if (!isset($client_counts[$interval_type])) {
        // Add new row for client & interval type
        $new_interval = [];
        $new_interval['interval_type'] = $interval_type;
        $new_interval['start_unix'] = $current_start_unix;
        array_push($intervals_to_add, $new_interval);
        continue;
    }
    $client_count = $client_counts[$interval_type];
    // Edge case check, should never fail
    if (!isset($max_hits_for_interval_types[$interval_type])) {
        continue;
    }

    // Check if row needs resetting to 0 with new start_unix
    $id = $client_count['id'];
    $row_start_unix = $client_count['start_unix'];
    if ($row_start_unix < $current_start_unix) {
        // Row is in the past, reset to current start unix
        $reset_obj = [];
        $reset_obj['id'] = $id;
        $reset_obj['start_unix'] = $current_start_unix;
        array_push($id_and_start_unix_to_resets, $reset_obj);
        continue;
    }

    // Row is still current,
    // Increment
    $max = $max_hits_for_interval_types[$interval_type];
    $interval_count = $client_count['interval_count'];
    if ($interval_count > $max) {
        // Too many requests for this interval, don't increment this interval type, but check the rest also
        $too_many_requests = TRUE;
        continue;
    }
    // Not spamming thsi interval, increment to new value
    $new_count = $interval_count + 1;
    $id_and_new_val = [];
    $id_and_new_val['id'] = $id;
    $id_and_new_val['interval_count'] = $new_count;
    array_push($id_and_new_vals, $id_and_new_val);
}

// Got array of rows to add, IDs to increment, and if user has spammed any intervals

// Add new rows
if (count($intervals_to_add) > 0) {
    add_new_rows($conn, $provider, $client_ip, $intervals_to_add);
}

// Increment IDs
if (count($id_and_new_vals) > 0) {
    set_new_interval_counts($conn, $provider, $id_and_new_vals);
}

// Reset IDs
if (count($id_and_start_unix_to_resets) > 0) {
    reset_interval_counts($conn, $provider, $id_and_start_unix_to_resets);
}

// If spamming, exit
if ($too_many_requests) {
    $conn->close();
    client_spam();
}

// If reached here, not spamming, return tile...

// Check if provider allows tile caching
$provider_allows_cache = provider_allows_caching($provider);

// If provider allows cache:
// Check DB for recent tile

// If cache tile exists & not expired, return cache tile
$id_expiry_extension = NULL;
$unix_now = time();
$dir_path = "../../images/tiles/${provider}/${map_id}/${z}/${x}/";
$extension = NULL;
$ctype = _get_ctype($map_id);
$max_age = 0;

$db_id = NULL;
if ($provider_allows_cache) {
    $id_expiry_extension = search_for_tile_id_and_expiry_and_extension($conn, $provider, $map_id, $z, $x, $y);
    if (!is_null($id_expiry_extension)) {
        // Check if expiry is in the past or future...
        $expiry_unix = $id_expiry_extension['expiry_unix'];
        $extension = $id_expiry_extension['extension'];
        $db_id = $id_expiry_extension['id'];
        $ctype = gen_ctype_from_extension($extension);
        if ($expiry_unix > $unix_now) {
            // If expiry is in future:
            // Fetch tile from cache
            $file_full_path = "${dir_path}${y}";
            if ($extension !== "" && $extension !== NULL) {
                $file_full_path = "${file_full_path}.${extension}";
            }
            $blob = get_file_from_storage($file_full_path);
            if (!is_null($blob)) {
                // DB success
                $conn->close();
                $max_age = $expiry_unix - $unix_now;
                // Set expiry header
                header("Cache-Control: max-age=${max_age},s-maxage=${max_age}");
                header("Content-type: ${ctype}");
                // Return
                die($blob);
            }
            // Server error, continue to API...
        }
        // If expiry is in past, continue to API...
    }
    // If reach here, no tile found in DB, fetch new from API...
}

// If cache not allowed, or tile not found, fetch new from API
$url = get_url($map_id, $z, $x, $y);
// Call API
$blob_and_headers = fetch_png_external_api_and_header($url);
// Blob
$blob = $blob_and_headers['blob'];
// Headers to parse for Max-Age and Ctype
$headers = $blob_and_headers['header'];
// Max age
//$max_age_or_null = parse_max_age_from_header($headers);
$max_age_or_null = 86400;
if (!is_null($max_age_or_null)) $max_age = $max_age_or_null;
// Ctype
$ctype = parse_ctype_from_header($headers);

// Cache tile if possible
if ($provider_allows_cache) {
    $extension = gen_extension_from_ctype($ctype);
    if (is_null($extension)) $extension = _get_extension($map_id);
    if (is_null($extension)) $extension = 'png';
    $extension = $conn->real_escape_string($extension);
    $file_full_path = "${dir_path}${y}.${extension}";
    // Cache allowed
    $file_success = cache_png_to_server($blob, $dir_path, $file_full_path);
    if ($file_success) {
        // Either update row, or add new row
        $table_prefix = 'tile_expiry_';
        $table_name = $table_prefix . $provider;
        $expiry_unix = $unix_now + $max_age;
        if (is_null($db_id)) {
            // New row
            $tile_expiry_post_sql =
            "INSERT INTO ${table_name}
            ( map_id, z, x, y, expiry_unix, extension )
            VALUES
            ( '${map_id}', ${z}, ${x}, ${y}, ${expiry_unix}, '${extension}' );"
            ;

            $result = $conn->query($tile_expiry_post_sql);
        } else {
            // Update row
            $tile_expiry_put_sql =
            "UPDATE ${table_name}
            SET expiry_unix = ${expiry_unix}, extension = '${extension}'
            WHERE id = ${db_id};"
            ;

            $result = $conn->query($tile_expiry_put_sql);
        }
        // DB updated
    }
}

// Return blob
$conn->close();
if ($provider_allows_cache && $max_age > 0) {
    // Set expiry header
    header("Cache-Control: max-age=${max_age},s-maxage=${max_age}");
}
// Set Ctype
header("Content-type: ${ctype}");
die($blob);



/*      Methods     */

// Get the maximum allowable IP hits for a interval types
// : { mon: int, day: int, hour: int, min: int }
function get_max_hits_for_interval_types($conn, $provider) {
    $field_names = 'interval_type, interval_max';
    $table_name = 'ip_hit_tile_max';
    $ip_hit_max_sql =
    "SELECT ${field_names}
    FROM ${table_name}
    WHERE provider = '${provider}';"
    ;

    $result = $conn->query($ip_hit_max_sql);

    // Check if there are any hits for IP in that interval range
    if ($result->num_rows != 0) {
        // Success, parse output and return assoc array
        $interval_type_max = [];
        while($row = $result->fetch_assoc()) {
            if (!isset($row['interval_type'])) {
                // Row error
                return NULL;
            }
            if (!isset($row['interval_max'])) {
                // Row error
                return NULL;
            }
            // Row data success
            $interval_type = $row['interval_type'];
            $interval_max = intval($row['interval_max']);
            $interval_type_max[$interval_type] = $interval_max;
        }
        // Success
        $result->close();
        $conn->next_result();
        return $interval_type_max;
    }
    return NULL;
}


// Check DB for user's IP to prevent spamming
// : { interval_type: {id, interval_count}, key: { val, val }, ... ]
// : []
function get_user_interval_counts($conn, $provider, $client_ip) {
    $table_prefix = 'ip_hit_tile_';
    $table_name = $table_prefix . $provider;

    // Generate SQL query
    $col_names = ['id', 'interval_type', 'interval_count, start_unix'];
    $field_names = implode(', ', $col_names);
    $sql_get =
    "SELECT ${field_names}
    FROM ${table_name}
    WHERE ip_address = '${client_ip}';"
    ;
    $result = $conn->query($sql_get);

    // Check if there are any hits for IP in that interval range
    $rtn_obj = [];
    while($row = $result->fetch_assoc()) {
        $row_obj = [];
        // Data check interval type
        if (!isset($row['interval_type'])) continue;
        $interval_type = $row['interval_type'];
        if ($interval_type == "") continue;
        // ID
        if (!isset($row['id'])) continue;
        $id_string = $row['id'];
        if ($id_string == "") continue;
        $id = intval($id_string);
        if ($id == 0) continue;
        // interval_count
        if (!isset($row['interval_count'])) continue;
        $interval_count_string = $row['interval_count'];
        if ($interval_count_string == "") continue;
        $interval_count_int = intval($interval_count_string);
        if ($interval_count_int == 0) continue;
        // start_unix
        if (!isset($row['start_unix'])) continue;
        $start_unix_string = $row['start_unix'];
        if ($start_unix_string == "") continue;
        $start_unix_int = intval($start_unix_string);
        if ($start_unix_int == 0) continue;
        $row_obj['id'] = $id;
        $row_obj['interval_count'] = $interval_count_int;
        $row_obj['start_unix'] = $start_unix_int;
        $rtn_obj[$interval_type] = $row_obj;
    }
    if ($result != FALSE && $result != TRUE) {
        $result->close();
    }
    $conn->next_result();
    return $rtn_obj;
}

function add_new_rows($conn, $provider, $client_ip, $intervals) {
    $table_prefix = 'ip_hit_tile_';
    $table_name = $table_prefix . $provider;

    // Store SQL strings in array
    $sql_string_array = [];
    foreach($intervals as $interval) {
        // Generate SQL query
        $interval_type = $interval['interval_type'];
        $start_unix = $interval['start_unix'];
        $sql_post =
        "INSERT INTO ${table_name}
        ( ip_address, interval_type, interval_count, start_unix )
        VALUES
        ( '${client_ip}', '${interval_type}', 1, ${start_unix} );"
        ;
        array_push($sql_string_array, $sql_post);
    }
    // Join SQL strings
    $sql_strings = implode(' ', $sql_string_array);
    // Call DB
    $conn->multi_query($sql_strings);
    do {
        if ($res = $conn->store_result()) {
            while ($row = $res->fetch_row()) {
            }
        }
        if ($conn->more_results()) {
        }
    } while ($conn->next_result());
}

function set_new_interval_counts($conn, $provider, $ips_and_vals) {
    $table_prefix = 'ip_hit_tile_';
    $table_name = $table_prefix . $provider;

    // Store SQL strings in array
    $sql_string_array = [];
    foreach($ips_and_vals as $ips_and_val) {
        $id = $ips_and_val['id'];
        $interval_count = $ips_and_val['interval_count'];
        // Generate SQL query
        $sql_put = 
        "UPDATE ${table_name}
        SET interval_count = ${interval_count}
        WHERE id = ${id};"
        ;
        array_push($sql_string_array, $sql_put);
    }
    // Join SQL strings
    $sql_strings = implode(' ', $sql_string_array);
    // Call DB
    $conn->multi_query($sql_strings);

    do {
        if ($res = $conn->store_result()) {
            while ($row = $res->fetch_row()) {
            }
        }
        if ($conn->more_results()) {
        }
    } while ($conn->next_result());
}

function reset_interval_counts($conn, $provider, $id_and_start_unix_to_resets) {
    $table_prefix = 'ip_hit_tile_';
    $table_name = $table_prefix . $provider;

    // Store SQL strings in array
    $sql_string_array = [];
    foreach($id_and_start_unix_to_resets as $id_and_start_unix_to_reset) {
        $id = $id_and_start_unix_to_reset['id'];
        $start_unix = $id_and_start_unix_to_reset['start_unix'];
        // Generate SQL query
        $sql_put = 
        "UPDATE ${table_name}
        SET start_unix = ${start_unix}, interval_count = 1
        WHERE id = ${id};"
        ;
        array_push($sql_string_array, $sql_put);
    }
    // Join SQL strings
    $sql_strings = implode(' ', $sql_string_array);
    // Call DB
    $conn->multi_query($sql_strings);

    do {
        if ($res = $conn->store_result()) {
            while ($row = $res->fetch_row()) {
            }
        }
        if ($conn->more_results()) {
        }
    } while ($conn->next_result());
}

function fetch_png_external_api($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_URL, $url);
    $blob = curl_exec($ch);
    curl_close($ch);

    if (!$blob) {
        // Error
        return FALSE;
    }
    // Image
    return $blob;
}

function fetch_png_external_api_and_header($url) {
    function parseHeader($rawHeader) {
        $header = array();
        $lines = preg_split('/\r\n|\r|\n/', $rawHeader);
        foreach ($lines as $key => $line) {
            $keyval = explode(': ', $line, 2);
            if (isset($keyval[0]) && isset($keyval[1])) {
                $header[strtolower($keyval[0])] = $keyval[1];
            }
        }
        return $header;
    }
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_HEADER, true);
    $response = curl_exec($ch);

    // Get response header
    $header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $header_string = substr($response, 0, $header_size);
    $header_assoc = parseHeader($header_string);

    $blob = substr($response, $header_size);

    curl_close($ch);

    if (!$blob) {
        // Error
        return FALSE;
    }
    // Image
    $rtn_obj = [];
    $rtn_obj['header'] = $header_assoc;
    $rtn_obj['blob'] = $blob;
    return $rtn_obj;
}

function cache_png_to_server($blob, $dir_path, $file_full_path) {
    function _create_dirs_if_needed($dir_path) {
        // Check for dir
        if (file_exists($dir_path)) {
            // File or folder found...
            if (is_dir($dir_path)) {
                // Folder already exists
                return TRUE;
            } else {
                // Error, target folder is a file
                return FALSE;
            }
        }
    
        try {
            // Dir missing: Create
            // Setup
            $permissions = 0770;
            $recursive = TRUE;
            $dir_success = mkdir($dir_path, $permissions, $recursive);
            if (!$dir_success) {
                // Error
                return FALSE;
            }
        } catch (Exception $e) {
            return FALSE;
        }
    
    
        // Check dir has now been created
        if (file_exists($dir_path)) {
            // File or folder found...
            if (is_dir($dir_path)) {
                // Now exists
                return TRUE;
            } else {
                // Error, target folder is a file
                return FALSE;
            }
        }
    
        // Error if reached here
        return FALSE;
    }
    // Create directory if not created
    $dir_success = _create_dirs_if_needed($dir_path);
    if (!$dir_success) {
        return FALSE;
    }

    // Write png file
    $bytes_written = file_put_contents($file_full_path, $blob);

    if ($bytes_written == FALSE) {
        // Error writing file
        return FALSE;
    }
    // Success
    return TRUE;
}


/*              Helper methods              */

function raw_to_map_id($map_id_raw)
{   // Pigeon-hole incoming ID param
    switch ($map_id_raw) {
        //case 'street': 
        case 'transport':
        case 'dark':
        //case 'sat':
        //case 'night':
        //case 'topo':
        //case 'ocean':
        case 'temp':
        case 'rain':
            return $map_id_raw; break;
    }
    bad_request();
}

function map_id_to_provider($map_id)
{   // Pigeon-hole parsed ID param
    switch ($map_id) {
        case 'street': return 'openstreetmap'; break;
        case 'transport': return 'thunderforest'; break;
        case 'dark': return 'stadiamaps'; break;
        case 'sat':
        case 'ocean':
            return 'arcgisonline'; break;
        case 'night': return 'nasa'; break;
        case 'topo': return 'opentopomap'; break;
        case 'temp':
        case 'rain': return 'openweathermap'; break;
    }
    bad_request();
}

function provider_allows_caching($provider) {
    // do needle/haystack
    switch ($provider) {
        case 'openstreetmap':
        case 'thunderforest':
        case 'stadiamaps':
        case 'arcgisonline':
        case 'nasa':
        case 'opentopomap':
        case 'openweathermap':
            return TRUE; break;
        default: return FALSE;
    }
}

function search_for_tile_id_and_expiry_and_extension($conn, $provider, $map_id, $z, $x, $y) {
    $table_prefix = 'tile_expiry_';
    $table_name = $table_prefix . $provider;

    $tile_expiry_sql =
    "SELECT id, expiry_unix, extension
    FROM ${table_name}
    WHERE map_id = '${map_id}'
    AND z = ${z}
    AND x = ${x}
    AND y = ${y};"
    ;
    $conn->next_result();
    $result = $conn->query($tile_expiry_sql);
    if ($result->num_rows == 1) {
        // Unpack and return: id, expiry_unix
        $row = $result->fetch_assoc();
        // ID
        $id = $row['id'];
        // Expiry
        $expiry_unix = $row['expiry_unix'];
        // extension
        $extension = $row['extension'];
        $rtn_obj = [];
        $rtn_obj['id'] = $id;
        $rtn_obj['expiry_unix'] = $expiry_unix;
        $rtn_obj['extension'] = $extension;
        $result->close();
        $conn->next_result();
        return $rtn_obj;
    }
    if ($result != FALSE && $result != TRUE) {
        $result->close();
    }
    $conn->next_result();
    return NULL;
}

function _get_extension($map_id) {
    $png = 'png';
    $jpeg = 'jpeg';
    switch ($map_id) {
        case 'street':
        case 'transport': 
        case 'dark':
        case 'topo':
        case 'temp':
        case 'rain': return $png; break;
        case 'sat':
        case 'night':
        case 'ocean': return $jpeg; break;
    }
    return $png;
}
function _get_ctype($map_id) {
    $png = 'image/png';
    $jpeg = 'image/jpeg';
    $gzip = 'gzip';
    switch ($map_id) {
        case 'street':
        case 'transport': 
        case 'dark':
        case 'topo':
        case 'temp':
        case 'rain': return $png; break;
        case 'sat':
        case 'night':
        case 'ocean': return $jpeg; break;
    }
    return $png;
}

function parse_ctype_from_header($header) {
    $prefix = 'image/';
    $png = "${prefix}png";
    $jpeg = "${prefix}jpeg";
    $jpg = "${prefix}jpg";
    $gzip = 'gzip'; // .vector.pbf
    if (isset($header['content-type'])) {
        $content_type = $header['content-type'];
        switch($content_type) {
            case $png:
            case $jpeg:
            case $jpg:
            case $gzip:
                return $content_type; break;
        }
        $prefix_pos = strpos($content_type, $prefix);
        if ($prefix_pos !== FALSE) {
            if ($prefix_pos === 0) {
                $content_type_len = strlen($content_type);
                if ($content_type_len > 12) $content_type = substr($content_type, 0, 12);
                return $content_type;
            }
        }
    }
    return '';
}

function gen_ctype_from_extension($extension) {
    $prefix = 'image/';
    $png = "${prefix}png";
    $jpeg = "${prefix}jpeg";
    $jpg = "${prefix}jpg";
    $gzip = 'gzip'; 
    switch($extension) {
        case 'png': return $png; break;
        case 'jpeg': return $jpeg; break;
        case 'jpg': return $jpg; break;
        case 'vector.pbf': return $gzip; break;
    }
    return $png;
}

function gen_extension_from_ctype($ctype) {
    $prefix = 'image/';
    $png = "${prefix}png";
    $jpeg = "${prefix}jpeg";
    $jpg = "${prefix}jpg";
    $gzip = 'gzip'; 
    switch($ctype) {
        case $png: return 'png'; break;
        case $jpeg: return 'jpeg'; break;
        case $jpg: return 'jpg'; break;
        case $gzip: return 'vector.pbf'; break;
    }
    return NULL;
}

function get_file_from_storage($file_full_path) {
    if (file_exists($file_full_path)) {
        if (!is_dir($file_full_path)) {
            // File found
            $file = file_get_contents($file_full_path);
            return $file;
        }
    }
    return NULL;
}

function get_max_age($map_id) {
    switch ($map_id) {
        case 'street': return 165280; break;
        case 'transport': return 21600; break;
        case 'dark': return 43200; break;
        case 'sat': return 86400; break;
        case 'night': return 0; break;
        case 'topo': return 604800; break;
        case 'ocean': return 86400; break;
        case 'temp': return 3600;
        case 'rain': return 3600;
    }
    return 0;
}

function parse_max_age_from_header($header) {
    if (!isset($header['cache-control'])) return NULL;
    $cache_control = $header['cache-control'];
    $pattern = '/max-age=([0-9]+)/';
    preg_match($pattern, $$cache_control, $matches, PREG_OFFSET_CAPTURE);
    if (!isset($matches[0])) return NULL;
    if (!isset($matches[0][0])) return NULL;
    $full_string = $matches[0][0];
    $suffix = 'max-age=';
    $seconds = substr($full_string, strlen($suffix));
    return $seconds;
}

function get_url($map_id, $z, $x, $y) {
    $api_key = ""; 
    switch ($map_id) {
        case 'street': return "https://tile.openstreetmap.org/${z}/${x}/${y}.png"; break;
        case 'transport': $api_key = file_get_contents('../keys/thunderforest.txt');
            return "https://tile.thunderforest.com/transport/${z}/${x}/${y}.png?apikey=${api_key}"; break;
        case 'dark': $api_key = file_get_contents('../keys/stadiamaps.txt');
            return "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/${z}/${x}/${y}.png?api_key=${api_key}"; break;
        case 'sat': return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}"; break;
        case 'night': return "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default//GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpg"; break;
        case 'topo': return "https://tile.opentopomap.org/${z}/${x}/${y}.png"; break;
        case 'ocean': return "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer/tile/${z}/${y}/${x}"; break;
        case 'temp': $api_key = file_get_contents('../keys/openweathermap.txt');
            return "https://tile.openweathermap.org/map/temp_new/${z}/${x}/${y}.png?appid=${api_key}"; break;
        case 'rain': $api_key = file_get_contents('../keys/openweathermap.txt');
            return "https://tile.openweathermap.org/map/precipitation_new/${z}/${x}/${y}.png?appid=${api_key}"; break;
    }
    return "";
}


/* 2xx Success */

/* 4xx Client error */
function bad_request() {
    $code = 400;
    http_response_code($code);
    die();
}
function client_spam() {
    $code = 429;
    http_response_code($code);
    die();
}
/* 5xx Server error */
function internal_server() {
    $code = 500;
    http_response_code($code);
    die();
}

?>