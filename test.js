/**
 * MMM-MuseumMasterpiece - Logic Tester
 * Run this to verify the API fetching and data processing works.
 * Usage: node test.js
 */

// 1. Mock the MagicMirror node_helper base class BEFORE requiring our helper
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'node_helper') {
        return {
            create: function(obj) { return obj; }
        };
    }
    return originalRequire.apply(this, arguments);
};

// 2. Now we can safely require our helper
const helper = require("./node_helper.js");

// 3. Mock the MagicMirror NodeHelper environment
const mockHelper = Object.assign({}, helper, {
    name: "MMM-MuseumMasterpiece",
    sendSocketNotification: function(notif, payload) {
        console.log("\n[NOTIFICATION RECEIVED]", notif);
        if (notif === "AIC_RESULT") {
            console.log("--------------------------------------------------");
            console.log("TITLE:      ", payload.title);
            console.log("ARTIST:     ", payload.artist);
            console.log("DATE:       ", payload.date);
            console.log("IMAGE URL:  ", payload.image);
            console.log("\nCURATOR DESCRIPTION:");
            console.log(payload.description);
            console.log("--------------------------------------------------");
            console.log("\n✅ SUCCESS: Logic is working perfectly.");
            process.exit(0);
        } else if (notif === "AIC_ERROR") {
            console.error("❌ ERROR:", payload.message);
            process.exit(1);
        }
    }
});

console.log("🚀 Testing AIC API Connection...");
mockHelper.start();

// Simulate the notification that MagicMirror would send
mockHelper.socketNotificationReceived("AIC_FETCH", { 
    seed: new Date().toISOString().split('T')[0], // Today's date
    imageSize: 843 
});

// Timeout fail
setTimeout(() => {
    console.error("❌ TIMEOUT: No response from API helper.");
    process.exit(1);
}, 10000);
