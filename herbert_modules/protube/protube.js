/**
 * Protube main module
 * Central point for storing Protube data and keeping it current.
 * @module protube
 */

var http_request = require('http-request');
var moment = require('moment');
require("moment-duration-format");

var ee = require('../../events');

var radioStations = [
    {
        'name' : 'SkyRadio',
        'url' : 'http://8623.live.streamtheworld.com/SKYRADIOAAC_SC'
    }
];
var currentRadioStation = 0;

var queue = [];
var current = {};
var pin = 0;

var volume = {
    "youtube" : 10,
    "radio" : 10
};

generatePin();

var status = {
    "playing" : false,
    "paused" : false,
    "playingRadio" : true,
    "slideshow" : true
};

module.exports.queue = queue;
module.exports.current = current;
module.exports.status = status;

/**
 * Sets Youtube volume
 * @param youtubeVolume
 */
module.exports.setYoutubeVolume = function(youtubeVolume) {
    volume.youtube = youtubeVolume;
    console.log("[protube] Youtube volume changed to " + youtubeVolume);
    ee.emit("volumeChange", volume);
};

/**
 * Sets radio volume
 * @param radioVolume
 */
module.exports.setRadioVolume = function(radioVolume) {
    volume.radio = radioVolume;
    console.log("[protube] Radio volume changed to " + radioVolume);
    ee.emit("volumeChange", volume);
};

/**
 * Returns current volumes.
 * @returns {{youtube: number, radio: number}}
 */
module.exports.getVolume = function() {
    return volume;
};

/**
 * Searches for a video on Youtube
 * @param data
 * @param timeLimit
 * @param callback
 */
module.exports.searchVideo = function(data, timeLimit, callback) {
    searchVideo(data, timeLimit, callback);
};

/**
 * Returns current radio station.
 * @returns {{name, url}|*}
 */
module.exports.getCurrentRadioStation = function() {
    return radioStations[currentRadioStation];
};

/**
 * Returns radio stations.
 * @returns {*[]}
 */
module.exports.getRadioStations = function() {
    return radioStations;
};

/**
 * Chooses random radio station from list, sets it as current and returns that station.
 * @returns {{name, url}|*}
 */
function getRadioStation() {
    currentRadioStation = getRandomInt(0, radioStations.length-1);
    return radioStations[currentRadioStation];
}

/**
 * Export for getNextVideo function.
 */
module.exports.getNextVideo = function() {
    getNextVideo();
};

/**
 * Returns current video
 * @returns {{current}}
 */
module.exports.getCurrent = function() {
    return current;
};

/**
 * Returns Protube queue
 * @returns {Array}
 */
module.exports.getQueue = function() {
    return queue;
};

/**
 * Returns playback status
 * @returns {{playing: boolean, paused: boolean}}
 */
module.exports.getStatus = function() {
    return status;
};

/**
 * Sets progress to given time in seconds.
 * @param time
 */
module.exports.setTime = function(time) {
    current.progress = time;
    ee.emit("progressChange", current.progress);
};

/**
 * Toggles pause status for Protube
 */
module.exports.togglePause = function() {
    status.paused = !status.paused;
    ee.emit("protubeStateChange", status);
};

/**
 * Returns current pin
 * @returns {number}
 */
module.exports.getPin = function() {
    return pin;
};

/**
 * Generates a new pin. To be called when PIN has been used.
 */
module.exports.generatePin = function() {
    generatePin();
};


/**
 * Pads number with zeroes to get constant length.
 *
 * @param number
 * @param length
 * @returns {string}
 */
function pad(number, length) {
    var str = '' + number;
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
}


/**
 * Generates new pin
 */
function generatePin() {
    pin = pad(Math.round( Math.random() * 1000 ), 3);
    ee.emit("pinChange", pin);
}

/**
 * Moves queue item up or down
 * @param index
 * @param direction
 */
module.exports.moveQueueItem = function(index, direction) {
    console.log("index", index, "direction", direction);

    function moveArrayElement (array, old_index, new_index) {
        array.splice(new_index, 0, array.splice(old_index, 1)[0]);
        return array; // for testing purposes
    }

    switch(direction) {
        case 'up':
            queue = moveArrayElement(queue, index, index-1);
            break;
        case 'down':
            queue = moveArrayElement(queue, index, index+1);
            break;
    }

    ee.emit("queueUpdated", queue);
};

module.exports.removeQueueItem = function(index) {
    queue.splice(index, 1);
    ee.emit("queueUpdated", queue);
};

/**
 * Adds video to Protube queue.
 *
 * @param data
 * @param socket
 */
module.exports.addToQueue = function(data, timeLimit) {
    // TODO: add fairness based on pins or something.
    http_request.get({
        url: 'https://www.googleapis.com/youtube/v3/videos?key=' + process.env.YOUTUBE_API_KEY + '&part=snippet,contentDetails&id=' + data.id
    }, function(err, res) {
        if(err) {
            console.log("[protube] Adding video resulted in error. "+err);
        } else {
            
            var response = JSON.parse(res.buffer.toString());

            if(response.pageInfo.totalResults == 0) {
                return false;
            }

            var video_data = response.items[0];

            for(var i in queue) {
                if(video_data.id == queue[i].id) {
                    return false;
                }
            }

            var video = {
                "id" 		: video_data.id,
                "title" 	: video_data.snippet.title,
                "duration" 	: parseISO8601Duration(video_data.contentDetails.duration),
                "progress"  : 0,
                "showVideo" : data.showVideo,
                "token"     : (data.token != null) ? data.token : null
            };

            if(!timeLimit || video.duration < process.env.YOUTUBE_MAX_DURATION) queue.push(video);

            console.log("[protube] Added " + video.title + " to Protube queue");

            ee.emit("queueUpdated", queue);

        }
    });
};


/**
 * Converts ISO8601 time to seconds.
 *
 * @param iso8601Duration
 * @returns {number}
 */
 function parseISO8601Duration(iso8601Duration) {
    var iso8601DurationRegex = /(-)?P(?:([\.,\d]+)Y)?(?:([\.,\d]+)M)?(?:([\.,\d]+)W)?(?:([\.,\d]+)D)?T(?:([\.,\d]+)H)?(?:([\.,\d]+)M)?(?:([\.,\d]+)S)?/;
    var matches = iso8601Duration.match(iso8601DurationRegex);

    var years = parseFloat(matches[2] === undefined ? 0 : matches[2]);
    var months = parseFloat(matches[3] === undefined ? 0 : matches[3]);
    var weeks = parseFloat(matches[4] === undefined ? 0 : matches[4]);
    var days = parseFloat(matches[5] === undefined ? 0 : matches[5]);
    var hours = parseFloat(matches[6] === undefined ? 0 : matches[6]);
    var minutes = parseFloat(matches[7] === undefined ? 0 : matches[7]);
    var seconds = parseFloat(matches[8] === undefined ? 0 : matches[8]);

    return seconds + minutes*60 + hours*3600 + days*86400 + weeks*86400*7 + months*86400*31 + years*86400*365;
};


/**
 * Increments time and checks for finish video.
 */
function incrementTimeAndCheckNext() {
    if(status.playing) {
        if(!status.paused) current.progress++;
        if(current.progress > current.duration) getNextVideo();
    }else{
        getNextVideo();
    }
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive)
 * Using Math.round() will give you a non-uniform distribution!
 */
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Gets next video from the queue, if available, and makes it current.
 */
function getNextVideo() {
    if(queue.length > 0) {
        current = queue.shift();

        status.playing = true;
        status.playingRadio = false;
        status.slideshow = !current.showVideo;

        console.log("[protube] Playing "+current.title);
        ee.emit("protubeStateChange", status);
        ee.emit("videoChange", current);
        ee.emit("queueUpdated", queue);
        ee.emit("progressChange", current.progress);
        
        http_request.get({
            url: encodeURI(process.env.PLAYEDVIDEO_ENDPOINT + '?secret=' + process.env.SECRET + '&token=' + current.token + '&video_id=' + current.id + '&video_title=' + current.title)
        }, function(err, res) {
            if (err) {
                console.log("[protube] Submitting played video resulted in error. " + err);
            }
        });
        
    }else{
        if(status.playing) {
            status.playing = false;
            status.playingRadio = true;
            status.slideshow = true;
            ee.emit("radioStation", getRadioStation());
            ee.emit("protubeStateChange", status);
            current = {};
            ee.emit("videoChange", current);
            ee.emit("queueUpdated", queue);
        }
    }
}

/**
 *
 * @param search
 * @param timeLimit:boolean
 */
function searchVideo(data, timeLimit, callback) {
    console.log("[protube] Performing search for " + data);
    http_request.get({ // Get search results from Youtube API
        url: 'https://www.googleapis.com/youtube/v3/search?key=' + process.env.YOUTUBE_API_KEY + '&part=snippet&maxResults=50&regionCode=nl&videoEmbeddable=true&type=video&q=' + data,
    }, function(err, res) {

        var searchResponse = JSON.parse(res.buffer.toString());

        var commaId = '';

        for(var i = 0; i<searchResponse.items.length; i++) { // Create comma-separated list of video ID's
            commaId += searchResponse.items[i].id.videoId + ',';
        }

        commaId = commaId.substr(0, commaId.length-1); // Remove last ,

        http_request.get({ // Get video details from Youtube API, since the search API can't provide durations...
            url: 'https://www.googleapis.com/youtube/v3/videos?key=' + process.env.YOUTUBE_API_KEY + '&part=contentDetails&maxResults=50&id='+commaId
        }, function(err, res) {

            var detailsResponse = JSON.parse(res.buffer.toString());

            var returnResponse = [];

            for(var i = 0; i<detailsResponse.items.length; i++) {

                var duration = moment.duration(detailsResponse.items[i].contentDetails.duration);

                if(!timeLimit || duration.asSeconds() < process.env.YOUTUBE_MAX_DURATION) {
                    returnResponse.push({
                        "id" : searchResponse.items[i].id.videoId,
                        "title" : searchResponse.items[i].snippet.title,
                        "channelTitle" : searchResponse.items[i].snippet.channelTitle,
                        "duration" : duration.format("mm:ss")
                    });
                }
            }

            callback(returnResponse);

        });
    });
}

// Interval for incrementing Protube time, and getting new video from queue if previous video has finished.
var I_incrementTime = setInterval(incrementTimeAndCheckNext, 1000);
