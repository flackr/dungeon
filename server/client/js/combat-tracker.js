dungeon.CombatTracker = function(client) {
  dungeon.EventSource.apply(this);
  load($('combat-tracker-page'), this.initialize.bind(this, client));
};

dungeon.CombatTracker.prototype = extend(dungeon.EventSource.prototype, {

  turnIndex: 0,

  initialize: function(client) {
    this.client = client;
    client.addEventListener('character-selected', this.onCharacterSelect.bind(this));
    client.addEventListener('character-added', this.onAddCharacter.bind(this));
    client.addEventListener('character-updated', this.onUpdateCharacter.bind(this));
    client.addEventListener('character-removed', this.onRemoveCharacter.bind(this));
    client.addEventListener('set-character-turn', this.onSetCharacterTurn.bind(this));
    client.addEventListener('power-used', this.onPowerUsed.bind(this));
    client.addEventListener('reset', this.onReset.bind(this));
    $('current-hp').addEventListener('change', this.updateHitPoints.bind(this));
    $('current-temp-hp').addEventListener('change', this.updateTemps.bind(this));

    var self = this;
    $('combat-end-turn').addEventListener('click', function() {
      var evt = {
        type: 'set-character-turn',
        index: self.turnIndex + 1
      };
      self.client.sendEvent(evt);
    });
  },

  updateHitPoints: function() {
    var value = $('current-hp').value;
    this.dispatchEvent('use-power', 'Stat-tweak', {stat: 'Hit Points', tweak: value});
  },

  updateTemps: function() {
    var value = $('current-temp-hp').value;
    this.dispatchEvent('use-power', 'Stat-tweak', {stat: 'Temps', tweak: value}); 
  },

  onAddCharacter: function(characterData) {
    var entry = $('combat-initiative-list-entry-template').cloneNode(true);
    entry.id = null;
    entry.getElementsByClassName('combat-tracker-name')[0].textContent = characterData.name;
    var checkbox = entry.getElementsByTagName('INPUT')[0];
    var self = this;
    var createCheckCallback = function() {
      var name = characterData.name;
      return function(e) {
        var value = e.target.checked;
        var characterIndex = self.client.getCharacterIndex(name);
        if (value) {
          var evt = {
            type: 'add-effects',
            character: characterIndex,
            effects: ['Grants Combat Advantage']
          };
          self.client.sendEvent(evt);
        } else {
          var evt = {
             type: 'remove-effect',
             character: characterIndex,
             effect: 'Grants Combat Advantage'
           };
          self.client.sendEvent(evt);
        }
        self.reportCombatAdvantageStatus(name, value);
      };
    };
    checkbox.addEventListener('change', createCheckCallback());

    var baseName = characterData.source.name;
    var entries =  $('combat-initiative-list').getElementsByClassName(
        'combat-initiative-list-entry');

    // If initiative has not been rolled, simple append to list.
    if (entries.length == 0 || entries[0].getAttribute('index') == undefined) {
      $('combat-initiative-list').appendChild(entry);
      return;
    }
    // Initiative has already been rolled so insert new critter into the list
    // grouping with other critters of same type.  A new critter type is added
    // to the end of the list.  
    // TODO: Should new critters roll initiative?
    var insertPoint = null;
    for (var i = entries.length - 1; i >= 0; i--) {
      var name = entries[i].getElementsByClassName('combat-tracker-name')[0].textContent;
      var index = this.client.getCharacterIndex(name);
      var characterData = this.client.getCharacter(index);
      if (characterData.source.name == baseName) {
        insertPoint = entries[i];
        break;
      }
    }
    if (insertPoint) {
      $('combat-initiative-list').insertBefore(entry, insertPoint.nextSibling);
      entry.setAttribute('index', insertPoint.getAttribute('index'));
    } else {
      var index = parseInt(entries[entries.length-1].getAttribute('index'));
      entry.setAttribute('index', index + 1);
      $('combat-initiative-list').appendChild(entry);
    }
  },

  onUpdateCharacter: function(characterIndex) {
    var characterData = this.client.getCharacter(characterIndex);
    var check = false;
    var effects = characterData.condition.effects;
    if (effects) {
      for (var i = 0; i < effects.length; i++) {
        var effect = effects[i];
        if (effect == 'Grants Combat Advantage') {
          check = true;
          break;
        }
      }
    }
    var entries =  $('combat-initiative-list').getElementsByClassName('combat-initiative-list-entry');
    for (var i = 0; i < entries.length; i++) {
       var candidate = entries[i].getElementsByClassName('combat-tracker-name')[0].textContent;
       if (candidate == characterData.name) {
         var checkbox = entries[i].getElementsByTagName('INPUT')[0];
         var wasChecked = checkbox.checked;
         checkbox.checked = check;
         if (check != wasChecked)
           this.reportCombatAdvantageStatus(candidate, check);
         break;
       }
    }
  },

  reportCombatAdvantageStatus: function(name, checked) {
    var msg = name + (checked ?
        ' grants combat advantage' :
        ' no longer granting combat advantage');
    this.client.dispatchEvent('log', msg);
  },
  
  onRemoveCharacter: function(characterName) {
    var nodes = $('combat-initiative-list').getElementsByClassName('combat-initiative-list-entry');
    for (var i = 0; i < nodes.length; i++) {
      var candidate = nodes[i].getElementsByClassName('combat-tracker-name')[0].textContent;
      if (candidate == characterName) {
        $('combat-initiative-list').removeChild(nodes[i]);
        break;
      }
    }
  },

  sortIntoInitiativeOrder: function() {
    var data = [];
    var entries = $('combat-initiative-list').getElementsByClassName('combat-initiative-list-entry');
    for (var i = 0; i < entries.length; i++) {
      entries[i].classList.remove('active-turn');
      var name = entries[i].getElementsByClassName('combat-tracker-name')[0].textContent;
      var index = this.client.getCharacterIndex(name);
      var characterData = this.client.getCharacter(index);
      var initiative = characterData.initiative;
      data.push({initiative: initiative, name: name, entry: entries[i]});
    }
    var comparator = function(a, b) {
      var result = 0;
      if (a.initiative != b.initiative)
        result = String(b.initiative) > String(a.initiative) ? 1 : -1;
      else 
        result = a.name > b.name ? 1 : -1;
      return result;
    }
    data.sort(comparator);
    for (var i = entries.length - 1; i > 0; i--)
      $('combat-initiative-list').removeChild(entries[i]);
    for (var i = 0; i < data.length; i++)
      $('combat-initiative-list').appendChild(data[i].entry);

    // Assign a placement index based on initiative order. New critters added
    // during combat are merged into the list with an assigned index.  When a
    // monster dies, other creatures retain their index leaving holes in the
    // numbering in order to simplify bookkeepping during turn order advancement.
    var index = 0;
    var last = '';
    for (var i = 0; i < entries.length; i++) {
      entries[i].setAttribute('index', index);
      var name = entries[i].getElementsByClassName('combat-tracker-name')[0].textContent;
      var characterIndex = this.client.getCharacterIndex(name);
      var characterData = this.client.getCharacter(characterIndex);
      var sourceName = characterData.source.name;
      if (sourceName != last) {
        index++;
        last = sourceName;
      }
    }
    this.onSetCharacterTurn(0);
  },

  onSetCharacterTurn: function(nextIndex) {
    var bounds = [];
    var lastName = null;
    var nodes = $('combat-initiative-list').getElementsByClassName('combat-initiative-list-entry');

    // Clear turn highlight
    for (var i = 0; i < nodes.length; i++)
      nodes[i].classList.remove('active-turn');

    // Find first critter matching turn order criterion.
    var first = null;
    for (var i = 0; i < nodes.length; i++) {
      var index = parseInt(nodes[i].getAttribute('index'));
      if (index >= nextIndex) {
        first = i;
        nodes[i].classList.add('active-turn');
        nextIndex = index; // In case skipping over a dead monster.
        break;
      }
    }
    // Check for wrap.
    if (first == null) {
      if (nextIndex != 0) {
        // Restart at top of the order.
        this.onSetCharacterTurn(0);
      }
      return;
    }
    // Select remainder in group.
    for (var i = first + 1; i < nodes.length; i++) {
      var index = parseInt(nodes[i].getAttribute('index'));
      if (index == nextIndex)
        nodes[i].classList.add('active-turn');
      else
        break;
    }
    $('combat-end-turn').disabled = false;
    this.turnIndex = nextIndex;
  },

  onCharacterSelect: function(character) {
    var active = $('active-character-name').textContent;
    if (active == character.name)
      return;

    // Only track character/monster instances.
    if (!('condition' in character))
      return;
    $('active-character-hp').hidden = false;
    $('combat-active-character').hidden = false;
    $('active-character-name').textContent = character.name;
    $('current-hp').value = character.condition.stats['Hit Points'];
    $('total-hp').textContent = character.source.stats['Hit Points'];
    var temps = character.condition.stats['Temps'];
    if (temps == undefined)
      temps = 0;
    $('current-temp-hp').value = temps;
    var powers = character.condition.powers;
    var setData = function(block, name, value) {
      block.getElementsByClassName(name)[0].textContent = value;
    }
    $('active-character-powers').textContent = '';

    var powerNames = ['Second Wind'];
    for (var i = 0; i < powers.length; i++) {
      powerNames.push(powers[i].name);
    }
    
    var repository = dungeon.Powers.getInstance();
    for (var i = 0; i < powerNames.length; i++) {
      var power = repository.get(powerNames[i]);
      power.useBy(character);
      block = $('power-summary-template').cloneNode(true);
      block.id = '';
      var actionType = power.getActionType();
      // Suppress move power for now. Eventually show all powers.
      if (actionType != 'Move Action') {
        var usage = power.getUsage();
        if (usage) {
          var usageClass = usage.split(' ')[0].toLowerCase();
          block.classList.add(usageClass);
        }
        setData(block, 'power-summary-name', power.getName());
        setData(block, 'power-summary-tooltip', power.getTooltip());
        block.data = {name: power.getName()};
        block.addEventListener('click', this.selectPower.bind(this, block));
        $('active-character-powers').appendChild(block);
      }
      power.cancel();
    }

    // force tab switch.
    this.client.onSelectView('sidebar-page', 'combat-tracker');
  },

  onPowerUsed: function() {
    // TODO(kellis): Remember last At-will power used to simplify process of reusing a power.

    // Reset selected power.
    this.selectPower();
  },

  onReset: function() {
    var entries = $('combat-initiative-list').getElementsByClassName('combat-initiative-list-entry');
    for (var i = entries.length - 1; i >= 0; i--)
      $('combat-initiative-list').removeChild(entries[i]);
  },

  selectPower: function(powerElement) {
    var characterName = $('active-character-name').textContent;
    var powerName = null;
    if (powerElement && powerElement.getAttribute('selected')) {
      powerElement.removeAttribute('selected');
    } else {
      var nodes = $('active-character-powers').getElementsByClassName('power-summary');
      for (var i = 0; i < nodes.length; i++)
        nodes[i].removeAttribute('selected');
      if (powerElement) {
        powerElement.setAttribute('selected', true);
        powerName = powerElement.data.name;
      }
    }
    this.dispatchEvent('power-selected', characterName, powerName);
  },

  selectedPower: function() {
    var nodes = $('active-character-powers').getElementsByClassName('power-summary');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('selected'))
        return nodes[i].data;
    }
  },

  displayedCharacterName: function() {
    if (!$('active-character-name'))
      return undefined;
    return $('active-character-name').textContent;
  },

  parseDamageRange: function(damage) {
    var val = 0;
    var min = 0;
    var max = 0;
    var multiplier = 0;
    for (var i = 0; i < damage.length; i++) {
      var ch = damage.charAt(i);
      if (ch >= '0' && ch <= '9') {
        val = 10*val + Number(ch);
      } else if (ch == 'd') {
        multiplier = val;
        val = 0;
      } else {
        if (multiplier) {
          min += multiplier;
          max += multiplier*val;
          val = multiplier = 0;
        } else {
          min += val;
          max += val;
          val = 0;
        }
      }
    }
    if (multiplier) {
      min += multiplier;
      max += multiplier*val;
    } else {
      min += val;
      max += val;
    }
    return [min, max];
  }
});
