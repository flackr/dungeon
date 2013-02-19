dungeon.UsePowerDialog = (function() {

  /* @const @enum */ HitType = {
    CRIT_MISS: 0,
    MISS: 1,
    HIT: 2,
    CRIT_HIT: 3
  };

  UsePowerDialog = function(client) {
    dungeon.Dialog.apply(this, [client, 'use-power']);
  }

  UsePowerDialog.prototype = {

    __proto__: dungeon.Dialog.prototype,

    initialize: function(client, name) {
      dungeon.Dialog.prototype.initialize.call(this, client, name);
    },

    /**
     * Display attack results.  DM may modify conditions as needed before the
     * power is resolved.
     * @param {source: number, 
     *         targets: Array.<number>,
     *         power: string}
     */
    update: function(info) {
      this.info = info;
      this.results = [];

      this.user = this.client.getCharacter(info.source);
      $('use-power-title').textContent = this.user.name + ' uses ' + info.power;

      // TODO: Fetch from character since power names are likely not unique for monsters.
      this.power = this.client.powers.get(info.power);
      this.power.useBy(this.user);

      // Clear previous results.
      var contentArea = $('power-results');
      while(contentArea.firstChild)
        contentArea.removeChild(contentArea.firstChild);

      this.damageRolls = this.displayDamageTable();
      this.toHitRolls = this.displayToHitTable();
      if (!this.toHitRolls) {
        this.displaySimpleTargetTable();
      }
      this.updateResults();
    },

    /**
     * Displays table of damage calculations, with field to tweak values.
     */
    displayDamageTable: function() {
      // Resolve damage roll for each immediate damage effect in the power.
      var damageRolls = null;
      if (this.power.powerDealsDamage()) {
        var damageTable = $('damage-template').cloneNode(true);
        damageTable.removeAttribute('id');
        var contentArea = $('power-results');
        contentArea.appendChild(damageTable);
        damageRolls = this.power.rollDamage();
        for (var i = 0; i < damageRolls.length; i++) {
          var roll = damageRolls[i];
          var result = $('damage-roll-template').cloneNode(true);
          result.removeAttribute('id');
          damageTable.appendChild(result);
          result.querySelector('.damage-string').textContent = roll.damageString;
          result.querySelector('.crit-damage-string').textContent = roll.critString;
          result.querySelector('.damage-type').textContent = roll.damageType;
          result.querySelector('.damage-roll').textContent = roll.rollString;
          var self = this;
          var updateCallback = (function() {
            var n = i;
            var input = result.querySelector('.damage-modifier');
            return function() {
              damageRolls[n].tweak = parseInt(input.value);
              self.updateResults();
            };
          })();
          result.querySelector('.damage-modifier').onchange = updateCallback;
        }
      }
      return damageRolls;
    },

    /**
     * Displays table of hit results with fields to tweak results.
     */
    displayToHitTable: function() {
      var hitRolls = null
      if (this.power.requiresToHitRoll()) {
        var baseToHit = this.power.getToHit();
        if (baseToHit > 0)
          baseToHit = '+' + baseToHit;
        var toHitStr = 'Attack: ' +  baseToHit + ' versus ' +
            this.power.getAttackedStat();
        var header = document.createElement('section');
        header.textContent = toHitStr;
        var contentArea = $('power-results');
        contentArea.appendChild(header);
        hitRolls = this.power.rollToHit(this.info.targets);
        var template = $('attack-table-template');
        var resultsTable = template.cloneNode(true);
        resultsTable.removeAttribute('id');
        contentArea.appendChild(resultsTable);
        var targets = this.info.targets;
        for (var i = 0; i < targets.length; i++) {
          var target = this.client.getCharacter(targets[i]);
          var result = $('attack-target-template').cloneNode(true);
          result.removeAttribute('id');
          resultsTable.appendChild(result);
          result.querySelector('.target-name').textContent = target.name;
          var hitRoll = hitRolls[i];
          var total = hitRoll.attack.roll + hitRoll.attack.adjusted;
          var rollStr = hitRoll.attack.roll;
          if (rollStr == 1 || rollStr == 20) {
            // FIXME: Hunter's instinct crits on a 19.
            rollStr = '<u>' + rollStr + '</u>';
          }
          var attackStr = '(' + rollStr + ') + ' +
              hitRoll.attack.adjusted + ' = ' + total;
          if (hitRoll.attack.adjusted != hitRoll.attack.base) {
            // Itemize bonuses and penalties.
            var mods = [];
            for (var j = 0; j < hitRoll.attack.adjustments.length; j++) {
              var adjustment = hitRoll.attack.adjustments[j];
              var add = adjustment.add;
              if (add > 0)
                add = '+' + add;
              mods.push(add + adjustment.reason); 
            }
            attackStr += '<br>' + mods.join('<br>');
          }
          result.querySelector('.attack-roll').innerHTML = attackStr;
          var defenseStr = hitRoll.defense.adjusted;
          if (hitRoll.defense.adjusted != hitRoll.defense.base) {
            // Itemize bonuses and penalties.
            var mods = [];
            for (var j = 0; j < hitRoll.defense.adjustments.length; j++) {
              var adjustment = hitRoll.defense.adjustments[j];
              var add = adjustment.add;
              if (add > 0)
                add = '+' + add;
              mods.push(add + adjustment.reason); 
            }
            defenseStr += '<br>' + mods.join('<br>');
          }
          result.querySelector('.target-defense').innerHTML = defenseStr;

          var self = this;
          var updateCallback = (function() {
            var n = i;
            var input = result.querySelector('.attack-mod');
            return function() {
              hitRolls[n].tweak = parseInt(input.value);
              self.updateResults();
            };
          })();
          result.querySelector('.attack-mod').onchange = updateCallback; 
        }
      }
      return hitRolls;
    },

    /**
     * Table used when effects to not require a to-hit role (e.g. Healing an ally).
     */
    displaySimpleTargetTable: function() {
      var contentArea = $('power-results');
      var template = $('simple-table-template');
      var resultsTable = template.cloneNode(true);
      resultsTable.removeAttribute('id');
      contentArea.appendChild(resultsTable);
      var targets = this.info.targets;
      for (var i = 0; i < targets.length; i++) {
        var target = this.client.getCharacter(targets[i]);
        var result = $('simple-target-template').cloneNode(true);
        result.removeAttribute('id');
        resultsTable.appendChild(result);
        result.querySelector('.target-name').textContent = target.name;
      }
    },

    /**
     * Recompute results based in modifications to to-hit and damage.
     */
    updateResults: function() {
      var contentArea = $('power-results');
      var entries = this.toHitRolls ?
        contentArea.getElementsByClassName('attack-target') :
        contentArea.getElementsByClassName('simple-target');

      // Track total damage applied to each target to properly cumulate the effect of
      // multi-attacks.
      var totalDamage = [];

      for (var i = 0; i < this.info.targets.length; i++) {
        var resultsElement = entries[i].querySelector('.attack-results');
        var targetIndex = this.info.targets[i];
        if(totalDamage[targetIndex] == undefined)
          totalDamage[targetIndex] = 0;
        var targetInfo = this.client.getCharacter(targetIndex);
        var totalDamageFromAttack = 0;
        this.results[targetIndex] = {};
        var hitType = HitType.HIT; // Automatic hit if roll not required.
        if (this.toHitRolls) {
          var roll = this.toHitRolls[i];
          var tweak = roll.tweak | 0;
          var attackTotal = roll.attack.roll + roll.attack.adjusted + tweak;
          var attackTarget = roll.defense.adjusted;
          if (roll.attack.roll == 1) {
            hitType = HitType.CRIT_FAIL;
          } else if (roll.attack.roll == 20) {
            // A 20 always hits, but only a crit if it would otherwise hit.
            hitType = (attackTotal >= attackTarget)  ? HitType.CRIT_HIT : HitType.HIT;
          } 
          else if (attackTotal >= attackTarget) {
            hitType = roll.attack.roll > this.getCritThreshold() ?
                HitType.CRIT_HIT : HitType.HIT;
          } else {
            hitType = HitType.MISS;
          }
        }
        var messages = [];
        switch(hitType) {
        case HitType.CRIT_FAIL:
           messages.push('EPIC FAIL');
           break;
        case HitType.CRIT_HIT:
        case HitType.HIT:
          if (this.damageRolls) {           
            for (var j = 0; j < this.damageRolls.length; j++) {
              var damageRoll = this.damageRolls[j];
              var damage = damageRoll.value;
              var damageTweak = damageRoll.tweak | 0;
              if (hitType == HitType.CRIT_HIT) {
                var critRoll = this.power.rollDice(damageRoll.critString);
                damage = critRoll.value;
              }
              damage = parseInt(damage) + damageTweak;

              // TOOD - handle resistances/vulnerabilities.

              var damageType = damageRoll.damageType;
              damageType = (damageType == 'untyped') ? '' : ' ' + damageType;
              var hitTypeStr = (hitType == HitType.CRIT_HIT) ? 'CRITICAL HIT' : 'HIT';

              messages.push(hitTypeStr + ' for ' + damage + ' ' +
                  damageRoll. damageType + ' damage');

              totalDamage[targetIndex] += damage;
              totalDamageFromAttack += damage;
            }
          }
          // Apply non-daamge effects.
          this.power.applyOnHitEffects(targetIndex, messages, this.results[targetIndex]);
          break;
        case HitType.MISS:
          messages.push('MISS');
          // Handle case of half damage on miss, and other miss effects.
          this.results[targetIndex]['Log'] = this.user.name + ' misses ' + targetInfo.name;
          this.power.applyOnMissEffects(targetIndex, messages, this.results[targetIndex]);
          break;
        }

        // Tally up all damage sources and report how messed up the target becomes.
        if (totalDamageFromAttack > 0) {
          // Message for logging.
          this.results[targetIndex]['Log'] =
              this.user.name + ' inflicts ' + totalDamageFromAttack +
              ' damage to ' +  targetInfo.name;

          var tempStr = targetInfo.condition.stats['Temps'];
          var temps = tempStr ? parseInt(tempStr) : 0;
          var newHp = parseInt(targetInfo.condition.stats['Hit Points']);
          var maxHp = parseInt(targetInfo.source.stats['Hit Points']);

          // Cumulative damage, potentially across multiple attacks on same target.
          // e.g. Twin Strike.
          temps -= totalDamage[targetIndex];
          if (temps < 0) {
            newHp += temps;
            temps = 0;
          }
          this.results[targetIndex]['Hit Points'] = newHp;
          this.results[targetIndex]['Temps'] = temps;
          messages.push(newHp + '/' + maxHp + 'HP + ' + temps + ' temps');
        }

        this.power.applyGeneralEffects(targetIndex, messages, this.results[targetIndex]);

        if (resultsElement)
          resultsElement.innerHTML = messages.join('<br>');
      }
    },

    /**
     * Determines target roll for a critical.  Usually a 20, but may be reduced
     * by certain effects.
     */
    getCritThreshold: function() {
      // TODO: Implement me.
      // Hunter's Instinct crits on a 19 or 20, but only if using a ranged attack
      // against a target within 2 squares.
      var critTarget = 20;
      return critTarget;            
    },

    /**
     * Called before closing the dialog to archive the changes.
     */
    commit: function() {
      var log = [];
      // Log use of the power.
      var targetNames = [];
      for (var i = 0; i < this.info.targets.length; i++) {
        var targetIndex = this.info.targets[i];
        var targetInfo = this.client.getCharacter(targetIndex);
        targetNames.push(targetInfo.name);
      }
      var message = this.user.name + ' uses "' + this.power.getName() +
        '" on ' + targetNames.join(', ') + '.\n';
      this.client.sendEvent({type: 'log', text: message});

      var result = {
        type: 'attack-result',
        characters: [],
        log: '',
      };

      for (var i in this.results) {
        var update = this.results[i];
        if (update['Log']) {
          log.push(update['Log']);
          delete update['Log'];
        }
        var empty = true;
        for (var key in update) {
          empty = false;
          break;
        }
        if (!empty)
          result.characters.push([i, update]);
      }
      result.log = log.join('\n');
      this.client.sendEvent(result);
    }

  };

  return UsePowerDialog;
})();
