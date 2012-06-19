dungeon.CombatTracker = function(client) {
  dungeon.EventSource.apply(this);
  load($('combat-tracker-page'), this.initialize.bind(this, client));
};

dungeon.CombatTracker.prototype = extend(dungeon.EventSource.prototype, {

  initialize: function(client) {
    this.client = client;
    client.addEventListener('character-selected', 
                          this.onCharacterSelect.bind(this));
    client.addEventListener('power-used', this.onPowerUsed.bind(this));
    $('current-hp').addEventListener('change', this.updateHitPoints.bind(this));
    $('current-temp-hp').addEventListener('change', this.updateTemps.bind(this));
  },

  updateHitPoints: function() {
    var value = $('current-hp').value;
    this.dispatchEvent('use-power', 'Stat-tweak', {stat: 'Hit Points', tweak: value});
  },

  updateTemps: function() {
    var value = $('current-temp-hp').value;
    this.dispatchEvent('use-power', 'Stat-tweak', {stat: 'Temps', tweak: value}); 
  },

  onCharacterSelect: function(character) {
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

    var block = $('power-summary-template').cloneNode(true);
    block.id = '';
    setData(block, 'power-summary-name', 'Healing surge');
    block.addEventListener('click',
        this.dispatchEvent.bind(this, 'use-power', 'healing-surge', {}));
    $('active-character-powers').appendChild(block);

    for (var i = 0; i < powers.length; i++) {
      var power = powers[i];
      block = $('power-summary-template').cloneNode(true);
      block.id = '';
      var usage = '';
      if (powers[i]['Power Usage']) {
        usage = powers[i]['Power Usage'].split(' ')[0].toLowerCase();
        block.classList.add(usage);
      }
      // Provide mechanism to easily extract combat information from the element
      // when selected.
      block.data = {
        name: power.name,
        usage: usage,
        toHit: '?',
        defense: '?',
        damage: '?',
        minDamage: '?',
        maxDamage: '?'
      };
      // Fill in block data with correct values.
      // Make assumption that first weapon in list is best.  TODO(kellis): Check assumption.
      var weapon = power.weapons && power.weapons.length > 0 ? power.weapons[0] : null;
      if (weapon) {
        block.data.toHit = weapon.toHit;
        block.data.defense = weapon.defense;
        if (weapon.damage.length > 0) {
          block.data.damage = weapon.damage;
          var damageRange = this.parseDamageRange(weapon.damage);
          block.data.minDamage = damageRange[0];
          block.data.maxDamage = damageRange[1];
        }
        setData(block, 'power-summary-name', power.name);
        setData(block, 'power-summary-attack-bonus', block.data.toHit);
        setData(block, 'power-summary-defense', block.data.defense);
        setData(block, 'power-summary-damage', block.data.damage);
        block.addEventListener('click', this.selectPower.bind(this, block));
        $('active-character-powers').appendChild(block);
      }
    }
    // force tab switch.
    this.client.onSelectView('sidebar-page', 'combat-tracker');
  },

  onPowerUsed: function() {
    // TODO(kellis): Remember last At-will power used to simplify process of reusing a power.

    // Reset selected power.
    this.selectPower();
  },

  selectPower: function(powerElement) {
    if (powerElement && powerElement.getAttribute('selected')) {
      powerElement.removeAttribute('selected');
      return;
    }
    var nodes = $('active-character-powers').getElementsByClassName('power-summary');
    for (var i = 0; i < nodes.length; i++)
      nodes[i].removeAttribute('selected');
    if (powerElement) {
      powerElement.setAttribute('selected', true);
      this.dispatchEvent('power-selected', $('active-character-name').textContent);
    }
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
