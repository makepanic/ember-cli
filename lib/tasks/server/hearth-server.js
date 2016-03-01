'use strict';

var Promise     = require('../../ext/promise');
var fs          = require('fs');
var Task        = require('../../models/task');
var SilentError = require('silent-error');
var walkSync    = require('walk-sync');
var path        = require('path');
var FSTree      = require('fs-tree-diff');
var debug       = require('debug')('ember-cli:hearth:');
var hearth = require('./cli/hearth');
var WS = require('./cli/ws');

function createServer(options) {
  var instance;

  var Server = (require('tiny-lr')).Server;
  Server.prototype.error = function() {
    instance.error.apply(instance, arguments);
  };
  instance = new Server(options);
  return instance;
}


module.exports = Task.extend({
  ipcServer(options) {
    if (this._ipcListener) {
      return this._ipcListener;
    }

    this._ipcListener = createServer(options);
    return this._ipcListener;
  },

  listen: function(options) {
    var server = this.ipcServer(options);

    return new Promise(function(resolve, reject) {
      server.error = reject;
      server.listen(options.port, options.host, resolve);
    });
  },

  start: function(options) {
    var tlroptions = {};

    //tlroptions.ssl = options.ssl;
    tlroptions.host = options.hearthHost || options.host;
    tlroptions.port = options.hearthPort || 9001;

    const ws = new WS({
      port: tlroptions.port,
      project: options.project,
      host: tlroptions.host
    });

    var mapping = {
      'hearth-ready': 'emitProjects',
      'hearth-run-cmd': 'runCmd',
      'hearth-kill-cmd': 'killCmd'
    };

    Object.keys(mapping).forEach((evName) => {
      ws.on(evName, (ws, data) => {
        console.log('ipc', evName, ...data);
        hearth[mapping[evName]](ws, ...data);
      });
    });

    //if (options.liveReload !== true) {
    //  return Promise.resolve('Livereload server manually disabled.');
    //}

    //if (options.ssl) {
    //  tlroptions.key = fs.readFileSync(options.sslKey);
    //  tlroptions.cert = fs.readFileSync(options.sslCert);
    //}

    //this.tree = new FSTree.fromEntries([]);

    // Reload on file changes
    //this.watcher.on('change', () => {
    //  try {
    //    this.didChange(...arguments);
    //  } catch(e) {
    //    this.ui.writeError(e);
    //  }
    //});
    //
    //this.watcher.on('error', this.didChange.bind(this));

    // Reload on express server restarts
    //this.expressServer.on('restart', this.didRestart.bind(this));

    //var url = 'http' + (options.ssl ? 's' : '') +
    //  '://' + this.displayHost(tlroptions.host) + ':' + tlroptions.port;
    // Start LiveReload server


    var url = 'http' + (options.ssl ? 's' : '') +
      '://' + this.displayHost(tlroptions.host) + ':' + tlroptions.port;

    this.writeBanner( url);
    return new Promise(() => {

    });
    //return this.listen(tlroptions)
    //  .then(this.writeBanner.bind(this, url))
    //  .catch(this.writeErrorBanner.bind(this, url));
  },

  displayHost: function(specifiedHost) {
    return specifiedHost || 'localhost';
  },

  writeBanner: function(url) {
    this.ui.writeLine('hearth socket on ' + url);
  },

  writeErrorBanner: function(url) {
    throw new SilentError('hearth failed on ' + url +
                          '.  It is either in use or you do not have permission.');
  },

  writeSkipBanner: function(filePath) {
    this.ui.writeLine('Skipping hearth for: ' + filePath);
  },

  getDirectoryEntries: function(directory) {
    return walkSync.entries(directory);
  },

  shouldTriggerReload: function(options) {
    var result = true;

    if (this.project.liveReloadFilterPatterns.length > 0) {
      var filePath = path.relative(this.project.root, options.filePath || '');

      result = this.project.liveReloadFilterPatterns.every(function(pattern) {
        return pattern.test(filePath) === false;
      });

      if (result === false) {
        this.writeSkipBanner(filePath);
      }
    }

    return result;
  },

  didChange: function(results) {
    var previousTree = this.tree;
    var files;

    if (results.directory) {
      this.tree = new FSTree.fromEntries(this.getDirectoryEntries(results.directory));
      files = previousTree.calculatePatch(this.tree)
        .filter(isNotDirectory)
        .map(relativePath)
        .filter(isNotSourceMapFile);

    } else {
      files = ['LiveReload files'];
    }

    debug('files %a', files);

    if (this.shouldTriggerReload(results)) {
      this.liveReloadServer().changed({
        body: {
          files: files
        }
      });

      this.analytics.track({
        name:    'broccoli watcher',
        message: 'live-reload'
      });
    }
  },

  didRestart: function() {
    this.liveReloadServer().changed({
      body: {
        files: ['LiveReload files']
      }
    });

    this.analytics.track({
      name:    'express server',
      message: 'live-reload'
    });
  }
});
