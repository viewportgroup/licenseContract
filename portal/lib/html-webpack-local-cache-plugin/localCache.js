/**
 * 前端缓存解决方案
 * @author zesonliu
 * @date   2017.4.18
 */
(function(context) {
    var doc = document;
    var writeCSSFile = function (cssFile, notLoad) {
        doc.write('<link href="'+cssFile+'" rel="stylesheet"' +
          (notLoad ? '' : ' onload="localCache.lazySave(\''+cssFile+'\')"') + '>');
    };
    var loadCSSFile = function (cssFile) {
        var link = doc.createElement('link');
        link.href = cssFile;
        link.rel = 'stylesheet';
        doc.head.appendChild(link);
    };
    var execCSS = function (content) {
        var style = doc.createElement('style');
        style.setAttribute('type', 'text/css');
        style.appendChild(doc.createTextNode(content));
        doc.head.appendChild(style);
    }
    var writeJSFile = function (jsFile, notLoad) {
      document.write('<script type="text/javascript" src="'+jsFile+'"' +
        (notLoad ? '' : ' onload="localCache.lazySave(\''+jsFile+'\')"') + '><\/script>');
    };
    var loadJSFile = function (jsFile) {
        var script = doc.createElement('script');
        script.src = jsFile;
        doc.body.appendChild(script);
    };
    var execJS = function (content) {
        var script = doc.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.appendChild(doc.createTextNode(content));
        doc.body.appendChild(script);
    };

    var store;
    var storage = {
        surport: 'localStorage' in window,
        set: function (key, value) {
            try {
              // console.log(JSON.stringify(key));
              // console.log(JSON.stringify(value));
              store.setItem(key, value);
            } catch (e) {
              console.log(e);
                console.error(e.message);
            }
        },
        get: function (key) {
            var content = null;
            try {
                content = store.getItem(key);
            } catch (e) {
                console.error(e.message);
            }
            return content;
        },
        remove: function (key) {
            try {
                store.removeItem(key);
            } catch (e) {
                console.error(e.message);
            }
        }
    };

    var LocalCache = function (config) {
        var self = this;
        self.config = config || {
            cssSync: true,
            jsSync: true
        };
        self.cachePrefix = 'asset_cache_';
        self.files = [];

        if (storage.surport) {
            store = window.localStorage;

            // 过期重新加载
            var expireKey = 'asset_ex';
            var nowTime = new Date().getTime();
            var expireTime = storage.get(expireKey);
            if (!expireTime || (nowTime > expireTime)) {
                self.clean();
                // 两天后过期
                storage.set(expireKey, nowTime + 2 * 24 * 60 * 60 * 1000);
            }
        }
    };

    LocalCache.prototype.save = function (fileName, callback, errCallback) {
        var self = this;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', fileName);
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
                        // 存到localstorage中
                        storage.set(self.cachePrefix + fileName, xhr.responseText);
                        callback && callback(xhr.responseText);
                    } else {
                        errCallback && errCallback();
                    }
                }
            };
            xhr.onerror = function () {
                errCallback && errCallback();
            };

            xhr.withCredentials = true;
            xhr.send(null);
        } catch(e) {
            console.error(e.message);
        }
    };

    var saveIdx = 0;
    LocalCache.prototype.lazySave = function (fileName) {
        var self = this;
        // 加上时间区间，减少并发
        setTimeout(function () {
            self.save(fileName);
        }, 500 + (++saveIdx) * 50);
    };

    // 并发加载控制
    var loadCtrl = {
        fileInfo: {},
        fileStatus: {},
        fileIndex: -1,
        loadIndex: 0,
        load: function (index, fileName, fileType, content) {
            var me = this;
            me.fileStatus[index] = true;
            me.fileInfo[index] = {
                name: fileName,
                content: content,
                type: fileType
            };

            while (me.fileStatus[me.loadIndex]) {
                var fileInfo = me.fileInfo[me.loadIndex];
                if (fileInfo.type === 'js') {
                    execJS(fileInfo.content);
                } else if (fileInfo.type === 'css') {
                    execCSS(fileInfo.content);
                } else if (fileInfo.type === 'rawjs') {
                    loadJSFile(fileInfo.name);
                } else if (fileInfo.type === 'rawcss') {
                    loadCSSFile(fileInfo.name);
                } else if (fileInfo.type === 'writecss') {
                    writeCSSFile(fileInfo.name, storage.support);
                } else if (fileInfo.type === 'writejs') {
                    writeJSFile(fileInfo.name, storage.support);
                }

                me.loadIndex++;
            }
        }
    };

    LocalCache.prototype.load = function (files, forceXhrLoad) {
        var self = this;

        if (typeof files === 'string') {
            files = [files];
        }

        for (var i = 0, len = files.length; i < len; i++) {
            // 文件下标
            var fileIndex = ++loadCtrl.fileIndex;
            var fileName = files[i];
            self.files.push(self.cachePrefix + fileName);

            var fileType;
            // var match = fileName.match(/\.(css|js)$/);
            var match = fileName.match(/\.(css|js)/); // remove the & by viewport.group@outlook.com

            if (match) {
                fileType = match[1];
            } else {
                continue;
            }

            // 无store的时候时候用link或script标签
            if (!storage.surport) {
                loadCtrl.load(fileIndex, fileName, 'write' + fileType);
                continue;
            }

            var content = storage.get(self.cachePrefix + fileName);
            if (content) {
                loadCtrl.load(fileIndex, fileName, fileType, content);
            } else {
                (function(loadIndex, fileName, fileType) {
                    // css使用write的方式同步样式，防止样式重绘
                    if (!forceXhrLoad && self.config.cssSync && fileType === 'css') {
                        loadCtrl.load(loadIndex, fileName, 'write' + fileType);

                    } else if (!forceXhrLoad && self.config.jsSync && fileType === 'js') {
                        loadCtrl.load(loadIndex, fileName, 'write' + fileType);

                    } else {
                        self.save(
                        fileName,

                        // 加载成功, 用行内js和css代替
                        function(content) {
                            loadCtrl.load(loadIndex, fileName, fileType, content);
                        },

                        // 加载失败, 用link或者script标签代替
                        function() {
                            loadCtrl.load(loadIndex, fileName, 'raw' + fileType);
                        });
                    }
                })(fileIndex, fileName, fileType);
            }
        }
    };

    LocalCache.prototype.clean = function () {
        var self = this;
        if (!storage.surport) {
            return;
        }
        setTimeout(function () {
            for (var key in store) {
                // 判断缓存有缓存前缀，不误删
                // 若当前的版本不再有该文件则删除
                if (new RegExp('^' + self.cachePrefix).test(key) && (self.files.indexOf(key) == -1)) {
                    storage.remove(key);
                }
            }
        }, 100);
    };

    context.LocalCache = LocalCache;
})(window);
