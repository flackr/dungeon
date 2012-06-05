dungeon.CombatTracker = function() {
  dungeon.EventSource.apply(this);
  this.initialize();
};

dungeon.CombatTracker.prototype = extend(dungeon.EventSource.prototype, {
  initialize: function() {
    this.addEventListener('character-selected', 
                          this.onCharacterSelect.bind(this));
  },

  onCharacterSelect: function(character) {
    $('combat-active-character').hidden = false;
    $('active-character-name').textContent = character.name;
    $('current-hp').textContent = character.condition.stats['Hit Points'];
    $('total-hp').textContent = character.source.stats['Hit Points'];
    var powers = character.condition.powers;
    var setData = function(block, name, value) {
      block.getElementsByClassName(name)[0].textContent = value;
    }
    $('active-character-powers').textContent = '';
    for (var i = 0; i < powers.length; i++) {
      var power = powers[i];
      var block = $('power-summary-template').cloneNode(true);
      block.id = '';
      // Provide mechanism to easily extract combat information from the element
      // when selected.
      block.data = {
        toHit: '?',
        defense: '?',
        damage: '?',
        minDamage: '?',
        maxDamage: '?'
      };
      // TODO(kellis): Fill in block data with correct values.
      var weapon = power.weapons[0];
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
        $('active-character-powers').appendChild(block);
      } 
    }
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
    console.log(damage + ' = [' + min + ', ' + max + ']');
    return [min, max];
  }
});

document.addEventListener('DOMContentLoaded', function() {
  dungeon.combatTracker = new dungeon.CombatTracker();
});
