dungeon.ParseCharacter = (function() {
  
  function parseCharacter_(xmlContent) {
    var parser=new DOMParser();
    var xmlDoc = parser.parseFromString(xmlContent,"text/xml");
    // Relevant sections in the D&D character sheet.
    var characterSheet = xmlDoc.getElementsByTagName('CharacterSheet')[0];
    var details = characterSheet.getElementsByTagName('Details')[0];
    var ruleSet = xmlDoc.getElementsByTagName('RulesElementTally')[0];
    // Set of rules that apply to the character
    var rules = ruleSet.getElementsByTagName('RulesElement');

    var stats =  extractStats(characterSheet);
    var abilityScores = extractAbilityScores_(characterSheet, stats);
    var abilityModifiers = extractAbilityModifiers_(characterSheet, abilityScores, stats);
    var json = {
       name: extractBasicAttribute_(details, 'name'),
       player: extractBasicAttribute_(details, 'Player'),
       level: Number(extractBasicAttribute_(details, 'Level')),
       charClass: extractRulesByType_(rules, 'Class')[0],
       abilityScores: abilityScores,
       abilityModifiers: abilityModifiers
    };
    return json;
  }

  function extractBasicAttribute_(el, tag) {
    var matches = el.getElementsByTagName(tag);
    if (matches && matches.length == 1)
      return matches[0].textContent;
  }

  function extractRulesByType_(rules, targetType) {
    var results = [];
    for (var i = 0; i < rules.length; i++) {
       var r = rules[i];
       var type = r.getAttribute('type');
       if (type == targetType) {
         results.push(r.getAttribute('name'));
       }
    }
    return results;
  }

  function extractAbilityScores_(node, stats) {
    var attributes = {};
    var baseAbilities = node.getElementsByTagName('AbilityScores')[0];
    var children = baseAbilities.childNodes;
    for (var i = 0; i < children.length; i++) {
      var node = children[i];
      if (node.nodeType != 1)
        continue;
      var name = node.tagName;
      var score = node.getAttribute('score');
      attributes[name] = (name in stats) ? stats[name] : score;
    }
    return attributes;
  }

  function extractAbilityModifiers_(node, abilities, stats) {
    var modifiers = {};
    for (var name in abilities) {
      var modifierStat = name + ' modifier';
      if (modifierStat in stats)
        modifiers[modifierStat] = stats[modifierStat];
    }
    return modifiers;
  }

  function extractStats(node) {
    var statMap = {};
    var statBlock = node.getElementsByTagName('StatBlock')[0];
    var stats = statBlock.getElementsByTagName('Stat');
    for (var i = 0; i < stats.length; i++) {
      var stat = stats[i];
      var value = stat.getAttribute('value');
      var aliases = stats[i].getElementsByTagName('alias');
      for (var j = 0; j < aliases.length; j++) {
         var name = aliases[j].getAttribute('name');
         statMap[name] = value;
      }
    }
    return statMap;
  }
 
  return parseCharacter_;

})();


