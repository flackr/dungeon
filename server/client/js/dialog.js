dungeon.Dialog = (function() {

  var registry_ = {};

  var activeDialog_ = null;

  function Dialog(client, name) {
    load(getElement(name), this.initialize.bind(this, client, name));
  }

  function getElement(name) {
    return $(name + '-dialog');
  }

  Dialog.prototype = {

     client: null,

     name: null,

     dragFrom: null,

     initialize: function(client, name) {
       this.client = client;
       this.name = name;
       var element = getElement(name);
       // Add listeners for close and cancel.
       var closeButtons = element.getElementsByClassName('close-button');
       for (var i = 0; i < closeButtons.length; i++)
         closeButtons[i].addEventListener('click', this.close.bind(this));
       var cancelButtons = element.getElementsByClassName('cancel-button');
       for (var i = 0; i < cancelButtons.length; i++)
         cancelButtons[i].addEventListener('click', this.cancel.bind(this));

       var titleBar = element.getElementsByClassName('dialog-title')[0];
       if (titleBar)
         titleBar.addEventListener('mousedown', this.onMouseDown_.bind(this));
     },

     show: function() {
       Dialog.show(this.name);
     },

     close: function() {
       this.commit();
       Dialog.dismiss(this.name);
     },

     cancel: function() {
       Dialog.dismiss(this.name);
     },

     commit: function() {
       // Override for specific dialog to commit changes to the dialog before closing.
     },

     onMouseDown_: function(e) {
       this.dragFrom = {
         x: e.clientX,
         y: e.clientY
       };
       document.addEventListener('mouseup', this.onMouseUp_.bind(this));
       document.addEventListener('mousemove', this.onMouseMove_.bind(this));
       return false;
     },

     onMouseUp_: function(e) {
       if (this.dragFrom) {
         this.dragFrom = null;
         document.removeEventListener('mouseup', this.onMouseUp_);
         document.removeEventListener('mousemove', this.onMouseMove_);
         return false;
       }
       return true;
     },

     onMouseMove_: function(e) {
       if (this.dragFrom) {
         var dragTo = {
           x: e.clientX,
           y: e.clientY
         };
         var dx = dragTo.x - this.dragFrom.x;
         var dy = dragTo.y - this.dragFrom.y;
         this.dragFrom = dragTo;
         var dialog = getElement(this.name);
         var top = dialog.offsetTop + dy;
         var left = dialog.offsetLeft + dx;
         var bottom = top + dialog.clientHeight;
         var right = left + dialog.clientWidth;
         // Constrain to document bounds.
         if (bottom > document.body.clientHeight)
           top = document.body.clientHeight - dialog.clientHeight;
         // Back off the limit for the right edge of the dialog by the
         // width of the drop shadow to prevent possible layout changes.
         var limit = document.body.clientWidth - 5;
         if (right > limit)
           left = limit - dialog.clientWidth;
         if (top < 0)
           top = 0;
         if (left < 0)
           left = 0;
         dialog.style.left = left + 'px';
         dialog.style.top = top + 'px';
         return false;
       }
       return true;
     },

  }

  /**
   * Displays a popup dialog.
   * @param {string} name Registered name of the dialog.
   * @param {{x: number, y: number}=} opt_position  Optional position of the dialog.
   *     If not specified, the dialog is centered.
   */
  Dialog.show = function(name, opt_position) {
    console.log('show dialog ' + name);
    activeDialog_ = registry_[name];
    var element = getElement(name);
    element.classList.add('positioning');
    element.style.left = '50%';
    element.style.top = '50%';
    element.hidden = false;
    element.parentNode.hidden = false;
    var width = element.clientWidth;
    var height = element.clientHeight;
    var left = element.offsetLeft;
    var top = element.offsetTop;
    console.log('dialog ' + name + ' is ' + width + ' by ' + height);
    var position = opt_position ? opt_position :
        {x: Math.floor(left - width/2), 
         y: Math.floor(top - height/2)};
    element.style.left = position.x + 'px';
    element.style.top = position.y + 'px';
    element.classList.remove('positioning');
  }

  Dialog.dismiss = function(name) {
    console.log('dismiss dialog');
    var element = getElement(name);
    element.hidden = true;
    element.parentNode.hidden = true;
  }

  Dialog.register = function(name, dialog) {
    registry_[name] = dialog;
  }

  Dialog.getInstance = function(name) {
    return registry_[name];
  }

  return Dialog;

})();

dungeon.initializeDialogs = function(client) {
  dungeon.Dialog.register('info', new dungeon.InfoDialog(client));
  dungeon.Dialog.register('power-editor', new dungeon.PowerEditorDialog(client));
  dungeon.Dialog.register('use-power', new dungeon.UsePowerDialog(client));
  dungeon.Dialog.register('add-effect', new dungeon.AddEffectDialog(client));
  dungeon.Dialog.register('custom-scripts', new dungeon.CustomScriptsDialog(client));
}
