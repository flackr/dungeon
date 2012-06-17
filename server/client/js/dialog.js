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
     }
  }

  /**
   * Displays a popup dialog.
   * @param {string} name Registered name of the dialog.
   * @param {{x: number, y: number}=} opt_position  Optional position of the dialog.
   *     If not specified, the dialog is centered.
   */
  Dialog.show = function(name, opt_position) {
    console.log('show dialog');
    if (activeDialog_ && activeDialog_.name != name)
      dungeon.Dialog.dismiss(activeDialog_.name);
    activeDialog_ = registry_[name];
    var element = getElement(name);
    element.classList.add('positioning');
    element.style.left = '50%';
    element.style.top = '50%';
    element.hidden = false;
    $('dialogs').hidden = false;
    var width = element.clientWidth;
    var height = element.clientHeight;
    var left = element.offsetLeft;
    var top = element.offsetTop;
    console.log('dialog is ' + width + ' by ' + height);
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
    $('dialogs').hidden = true;
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
  dungeon.Dialog.register('power-editor', new dungeon.PowerEditorDialog(client));
}
