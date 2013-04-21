dungeon.CharacterDetailsPage = (function() {

  /**
   * Constructor.
   */
  CharacterDetailsPage = function(client) {
    load($('character-page'), this.initialize.bind(this, client));
  };

  CharacterDetailsPage.prototype = {

    initialize: function(client) {
      this.client = client;
      client.addEventListener('character-selected', 
                              this.onCharacterSelect.bind(this));
      $('stats-button').addEventListener('click', this.onShowStats.bind(this));
      $('powers-button').addEventListener('click', this.onShowPowers.bind(this));
    },

    onCharacterSelect: function(characterData) {
      var selectCharacterView = true;
      if ('source' in characterData) {
        characterData = characterData.source;
        selectCharacterView = false;
      }
      createCharacterSheet_(characterData);
      populateCharacterSheet_(characterData);
      var buttons = document.getElementsByClassName('character-button');
      for (var i = 0; i < buttons.length; i++)
        buttons[i].setAttribute('active', false);
      var activeButtonName = characterData.name + '-character-button';
      $(activeButtonName).setAttribute('active', true);
      if (selectCharacterView)
        this.client.onSelectView('page', 'character');
    },

    onShowStats: function() {
      $('powers-tab').hidden = true;
      $('stats-tab').hidden = false;
      $('powers-button').setAttribute('active', false);
      $('stats-button').setAttribute('active', true);
    },

    onShowPowers: function() {
      $('stats-tab').hidden = true;
      $('powers-tab').hidden = false;
      $('stats-button').setAttribute('active', false);
      $('powers-button').setAttribute('active', true);
    }

  };

  // Private helper methods for creating the character/monster sheet.

  /* @const */ var POWER_ORDERING_PREFERENCE = [
    'No Action',
    'Immediate Interrupt',
    'Immediate Reaction',
    'Free Action',
    'Minor Action',
    'Move Action',
    'Standard Action'
  ];

  function createCharacterSheet_(characterData) {
    var createStatEntries = function(category) {
      var list = $(category + '-list');
      // Clear existing content.
      while (list.firstChild)
        list.removeChild(list.firstChild);
      // Populate fields.
      var stats = characterData[category];
      for (var i = 0; i < stats.length; i++) {
        var name = stats[i];
        var stat = $('character-stat-template').cloneNode(true);
        stat.id = name + '-stat';
        list.appendChild(stat);
      }
    }
    createStatEntries('attributes');
    createStatEntries('defenses');
    createStatEntries('health');
    createStatEntries('skills');
    createStatEntries('other');
  }

  function sortPowers_(characterData) {
     var sortIndices = {};
     for (var i = 0; i < POWER_ORDERING_PREFERENCE.length; i++) {
       sortIndices[POWER_ORDERING_PREFERENCE[i]] = i;
     }
     var getIndex = function(power) {
       var action = power['Action Type'];
       return (action in sortIndices) ? sortIndices[action] : 
         POWER_ORDERING_PREFERENCE.length;
     }
     var sortFunction = function(a, b) {
       var diff = getIndex(a) - getIndex(b);
       if (diff == 0)
         diff = a.name < b.name ? -1 : 1;
       return diff;
     }
     var list = characterData.powers;
     list = list.slice(0,list.length);
     return list.sort(sortFunction);
  }

  function SimplifyPowerName(name) {
    // TODO(kellis): Add other filters here as required.
    return name.replace('[Movement Technique]', '(move)');
  }

  function populateCharacterSheet_(characterData) {
    var populateField = function(parent, name, value) {
      var field = parent ? parent.getElementsByClassName(name)[0] : null;
      if (field) {
        field.textContent = value;
      } else {
        console.log('Unable to set ' + name + '=' + value +
            ' on character sheet.');
      }
    }
    var populateStatEntries = function(category) {
      var list = characterData[category];
      for (var i = 0; i < list.length; i++) {
        var name = list[i];
        var stat = $(name + '-stat');
        if (!stat) {
          console.log('Unable to populate stat "' + name + '".');
          continue;
        }
        var value = characterData.stats[name];
        if (value == undefined)
          value = '?';
        var modifier = characterData.stats[name + ' modifier'];
        populateField(stat, 'stat-name', name + ':');
        populateField(stat, 'stat-value', value);
        var modifierField = stat.getElementsByClassName('stat-modifier')[0];
        if (modifier) {
          if (Number(modifier) > 0)
            modifier = '+' + modifier;
          modifierField.textContent = modifier;
          modifierField.hidden = false;
        } else  {
          modifierField.hidden = true;
        }
      }
    }
    populateStatEntries('attributes');
    populateStatEntries('defenses');
    populateStatEntries('health');
    populateStatEntries('skills');
    populateStatEntries('other');

    if (characterData.stats['URL']) {
      var value = characterData.stats['URL'];
      var urlElement = $('compendium-url');
      urlElement.hidden = false;
      urlElement.innerHTML = '<a href="' + value + '" target="_conpendium">'
          + value + '</a>';
    } else {
      $('compendium-url').hidden = true;
    }

    $('at-will-list').textContent = '';
    $('recharge-list').textContent = '';
    $('encounter-list').textContent = '';
    $('daily-list').textContent = '';

    var isMonster = characterData.stats['Class'] == 'Monster';
    var list = sortPowers_(characterData);
    for (var i = 0; i < list.length; i++) {
      var power = list[i];
      var name = SimplifyPowerName(power.name);
      var usage = power['Power Usage'];
      var type = power['Action Type'];
      var block = $('power-template').cloneNode(true);
      block.id = '';
      var title = block.getElementsByClassName('power-title')[0];
      var categoryClass = 'power-' + type.toLowerCase().replace(' ', '-');
      title.classList.add(categoryClass);
      var createToggleDetailsCallback = function(element) {
        return function() {
          var details = element.getElementsByClassName('power-details')[0];
          details.hidden = !details.hidden;
          element.getElementsByClassName('power-details-show')[0].hidden = !details.hidden;
          element.getElementsByClassName('power-details-hide')[0].hidden = details.hidden;
        }
      };
      var SetValue = function(key, section) {
        var value;
        if (typeof key == 'string') {
          value = power[key];
        } else {
          value = [];
          for (j = 0; j < key.length; j++) {
            value.push(power[key[j]]);
          }
          value = value.join('\n');
        }
        if (value) {
           var sectionElement = block.getElementsByClassName(section)[0];
           sectionElement.hidden = false;
           var valueElement = sectionElement.getElementsByClassName(
               'power-value')[0];
           // Setting as text content does not preserve newlines or multiple
           // whitespace indent.  
           value = value.replace(/^\s+|\s+$/g,'');
           if (key.indexOf('Augment') == 0) {
             // Ugly hack to force power augmentation to start on a separate
             // line. Augmentations override rules for one or more categories
             // such as 'Attack Type' and 'Hit'.  Each category should start
             // on a separate line.
             value = '\n' + value;
             var matches = value.match(/(^|\n)[A-Z a-z]+(?=\:)/g);
             if (matches) {
               for (var i = 0; i < matches.length; i++) {
                 var match = matches[i];
                 var index = value.indexOf(match);
                 value = value.replace(match, '<em>' + match + '</em>');
               }
             }
           }
           value = value.replace(/\n/g, '<br>');
           value = value.replace(/(\t)+/g, '&nbsp; &nbsp; &nbsp;');
           valueElement.innerHTML = value;
        }
      };
      var toggleDetails = createToggleDetailsCallback(block);
      block.addEventListener('click', toggleDetails);
      block.getElementsByClassName('power-name')[0].textContent = name;
      block.getElementsByClassName('power-type')[0].textContent = type;
      if (power['Flavor'])
        block.getElementsByClassName('power-description')[0].textContent = power['Flavor'];

      var effectBlock = block.getElementsByClassName('power-effect')[0];
      if (power.weapons && power.weapons.length > 0) {
        effectBlock.getElementsByClassName('power-to-hit-section')[0].hidden = false;
        effectBlock.getElementsByClassName('power-damage-section')[0].hidden = isMonster;
        effectBlock.getElementsByClassName('power-crit-section')[0].hidden = isMonster;

        // Assume preferred weapon is at the top of the list.
        var weapon = power.weapons[0];

        if (weapon.defense == 'unknown') {
          // False alarm. See this weird pattern on several healing powers.
          effectBlock.getElementsByClassName('power-to-hit-section')[0].hidden = true;
          effectBlock.getElementsByClassName('power-damage-section')[0].hidden = true;
          effectBlock.getElementsByClassName('power-crit-section')[0].hidden = true;
        }

        if (weapon.crit == 0) {
          // A non-damaging attack against one or more targets.
          effectBlock.getElementsByClassName('power-damage-section')[0].hidden = true;
          effectBlock.getElementsByClassName('power-crit-section')[0].hidden = true;
        }
 
        var damage = weapon.damage;
        if (weapon.name != '')
          damage += ' (' + weapon.name + ')';

        populateField(effectBlock, 'power-attack-bonus', weapon.toHit);
        populateField(effectBlock, 'power-defense', weapon.defense);
        populateField(effectBlock, 'power-damage', damage);
        populateField(effectBlock, 'power-crit', weapon.crit);
      }
      SetValue('Recharge', 'power-recharge-section');
      SetValue('Trigger', 'power-trigger-section');
      SetValue('Attack Type', 'power-attack-type-section');
      if (power['Target'])
        SetValue('Target', 'power-targets-section');
      else if (power['Targets'])
        SetValue('Targets', 'power-targets-section');
      SetValue('Special', 'power-special-effects');
      SetValue('Hit', 'power-hit-effects');
      SetValue('Effect', 'power-general-effects');
      SetValue('Miss', 'power-miss-effects');
      SetValue('Augment1', 'power-augment-1-effects');
      SetValue('Augment2', 'power-augment-2-effects');
      SetValue('Conditions', 'power-conditions');

      var url = power.url;
      if (url) {
        var linkBlock = block.getElementsByClassName('power-conpendium-link')[0];
        linkBlock.hidden = false;
        var linkElement = linkBlock.getElementsByClassName('power-url')[0];
        linkElement.href = url;
        var index = url.indexOf('?');
        linkElement.textContent = (index > 0) ? url.substring(index + 1) : url;          
      }
      var editButton = block.getElementsByClassName('edit-power-button')[0];
      var editPowerCallback = function(element) {
        var selectedPower = power;
        return function(e) {
          e.stopPropagation();
          var dialog = dungeon.Dialog.getInstance('power-editor');
          dialog.update(characterData, selectedPower.name);
          dialog.show();
        }
      };
      editButton.addEventListener('click', editPowerCallback());
      var category = usage.toLowerCase().trim();
      var index = category.indexOf(' ');
      if (index > 0)
        category = category.substring(0, index);
      $(category + '-list').appendChild(block);

      if(isMonster)
        toggleDetails();
    }

    var setListVisibility = function(name) {
      var list = $(name);
      list.parentNode.parentNode.hidden = list.childNodes.length == 0;
    }
    setListVisibility('at-will-list');
    setListVisibility('recharge-list');
    setListVisibility('encounter-list');
    setListVisibility('daily-list');
  }

  return CharacterDetailsPage;

})();
