'use strict';
var extend = require('util')._extend;
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var http = require('http');
var path = require('path');
var open = require('opn');
var binVersionCheck = require('bin-version-check');
var fs = require('fs');

module.exports = (function () {
    var checkServerTries = 0;
    var retryCount = 20;
    var workingPort = 8000;
    var pid;

    function checkServer(hostname, port, cb) {
        setTimeout(function () {
            http.request({
                method: 'HEAD',
                hostname: hostname,
                port: port
            }, function (res) {
                var statusCodeType = Number(res.statusCode.toString()[0]);

                if ([2, 3, 4].indexOf(statusCodeType) !== -1) {
                    return cb();
                } else if (statusCodeType === 5) {
                    return cb('Server docroot returned 500-level response. Please check ' +
                        'your configuration for possible errors.');
                }

                checkServer(hostname, port, cb);
            }).on('error', function (err) {
                // back off after 1s
                if (++checkServerTries > retryCount) {
                    return cb('PHP server is not running');
                }
                checkServer(hostname, port, cb);
            }).end();
        }, 500);
    }

    var closeServer = function (cb) {
        if (pid) {
            exec('kill ' + pid, function (error, stdout, stderr) {
                //console.log('stdout: ' + stdout);
                //console.log('stderr: ' + stderr);
                cb(error);
            });
            return;
        }
        var child = exec('lsof -i :' + workingPort,
            function (error, stdout, stderr) {
                //console.log('stdout: ' + stdout);
                //console.log('stderr: ' + stderr);
                if (error !== null) {
                    console.log('exec error: ' + error);
                }

                // get pid then kill it
                var pid = stdout.match(/php\s+?([0-9]+)/)[1];
                if (pid) {
                    exec('kill ' + pid, function (error, stdout, stderr) {
                        //console.log('stdout: ' + stdout);
                        //console.log('stderr: ' + stderr);
                        cb(error);
                    });
                } else {
                    cb("couldn't find process id and kill it");
                }
            });
    };

    var server = function (options, cb) {
        if (!cb) {
            cb = function (err) {
                err && console.error(err)
            };
        }

        options = extend({
            port: 8000,
            hostname: '127.0.0.1',
            base: '.',
            open: false,
            bin: 'php',
            root: '/',
            retryCount: 20,
            stdio: 'inherit'
        }, options);

        retryCount = options.retryCount;

        workingPort = options.port;
        var host = options.hostname + ':' + options.port;
        var args = ['-S', host, '-t', options.base];
        var bin = options.bin;

        if (options.ini) {
            args.push('-c', options.ini);
        }

        if (options.router) {
            args.push(require('path').resolve(options.router));
        }
        console.log('binVersionCheck', bin);
        binVersionCheck('"' + bin + '"', '>=5.4', function (err) {
            console.log('binVersionChec2k', err);
            if (err) {
                cb(err);
                return;
            }
            var checkPath = function () {
                var exists = fs.existsSync(options.base);
                console.log('checkPath', options.base, exists);
                if (exists === true) {
                    const spawned = spawn(path.basename(bin), args, {
                        cwd: path.dirname(bin),
                        // stdio: options.stdio
                    });
                    pid = spawned.pid;
                    let errorLog = '';
                    spawned.stderr.on('data', (data) => {
                        errorLog += data.toString();
                    });

                    spawned.on('close', (code) => {
                        pid = undefined;
                        if (code != 0) {
                            cb(errorLog);
                        }
                    });
                } else {
                    cb('base path not existing');
                    // setTimeout(checkPath, 100);
                }
            };
            checkPath();
            // check when the server is ready. tried doing it by listening
            // to the child process `data` event, but it's not triggered...
            checkServer(options.hostname, options.port, function (err) {
                if (!err && options.open) {
                    open('http://' + host + options.root);
                }
                cb(err);
            }.bind(this));
        }.bind(this));
    };
    return {
        server: server,
        closeServer: closeServer
    }
})();
