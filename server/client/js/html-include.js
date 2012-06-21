var htmlIncluder = function() {

  function resolvePath(path, relative) {
    var dirs = (path + relative).split('/');
    for (var i = 1; i < dirs.length; i++) {
      if (dirs[i] == '..' && dirs[i - 1] != '..') {
        // Cancel the last directory.
        dirs.splice(i - 1, 2);
        i -= 1; // Resume processing from the same node.
      }
    }
    return dirs.join('/');
  }

  function pathOf(filepath) {
    var lastslash = filepath.lastIndexOf('/');
    if (lastslash == -1)
      return '';
    return filepath.substr(0, lastslash + 1);
  }

  function loadSrc(node) {
    var src = node.getAttribute('src');
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
      if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
        node.innerHTML = xmlhttp.responseText;
        var includelist = node.getElementsByTagName('include');
        var count = includelist.length + 1;
        var ready = function(src) {
          count--;
          if (count == 0) {
            var f;
            node.setAttribute('ready', 'true');
            while (f = node.data.onload.pop())
              f(src);
          }
        };
        for (var j = 0; j < includelist.length; j++) {
          if (includelist[j].getAttribute('src')) {
            includelist[j].setAttribute('src',
                resolvePath(pathOf(src), includelist[j].getAttribute('src')));
            if (!includelist[j].data)
              includelist[j].data = {onload: []};
            includelist[j].data.onload.push(ready);
          }
        }
        doInclude(includelist);
        ready(node.getAttribute('src'));
      }
    }
    xmlhttp.open('GET', src, true);
    xmlhttp.send();
  }

  function doInclude(nodelist) {
    for (var i = 0; i < nodelist.length; i++) {
      var node = nodelist[i];
      if (!node.getAttribute('ready')) {
        loadSrc(node);
      }
    }
  }

  return {
    doInclude: doInclude,
  }
}();

function load(node, func, log) {
  var count = 1;
  var ready = function(src) {
    count--;
    if (log)
      console.log('Finished loading '+src+'. '+count+' to go');
    if (count == 0) {
      func(node);
    }
  }

  var includesrcs = '';
  // Scoped to not remember the includelist in the closure.
  {
    // Get all include nodes including the current.
    var includelist = Array.prototype.slice.call(
        node.getElementsByTagName('include'), 0);
    if (node.tagName == 'INCLUDE')
      includelist.push(node);
    for (var i = 0; i < includelist.length; i++) {
      if (!includelist[i].getAttribute('ready')) {
        count++;
        if (!includelist[i].data)
          includelist[i].data = {onload: []};
        includelist[i].data.onload.push(ready);
        includesrcs += ' ' + includelist[i].getAttribute('src');
      }
    }
    if (log)
      console.log('Loading'+includesrcs);
    htmlIncluder.doInclude(includelist);
  }
  // This will trigger func immediately if no includes are necessary.
  ready('');
}
