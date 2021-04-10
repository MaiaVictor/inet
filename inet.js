// p --|\a        b/|-- s
//     |0|--------|0|
// q --|/          \|-- r
// ======================
// p --x            y-- s
//
// q --y            x-- r

// p --|\a        b/|-- s
//     |1|--------|2|
// q --|/          \|-- r
// ======================
//    n0/|--x  x--|\n3
// p --|2|        |1|-- s
//      \|--y  z--|/
//      /|--z  y--|\
// q --|2|        |1|-- r
//    n1\|--w  w--|/n2


module.exports = function INet(rules) {
  function parse_sexp(str) {
    while (/\s/.test(str[0])) {
      str = str.slice(1);
    }
    if (str[0] === "(") {
      var term = [];
      while (str[0] !== ")") {
        var [str, argm] = parse_sexp(str.slice(1));
        if (argm !== "") {
          term.push(argm);
        }
      }
      return [str.slice(1), term];
    } else {
      var term = "";
      while (str !== "" && /[\w\-<>]/.test(str[0])) {
        term += str[0];
        str = str.slice(1);
      }
      return [str, term];
    }
  };
  function build_rules(code) {
    function is_external(var_name) {
      return var_name[0] === "<" || var_name[1] === ">";
    }
    function dest_code(dest) {
      if (is_external(dest)) {
        return dest[0] === "<" ? "a_out"+Number(dest[1]) : "b_out"+Number(dest[0]);
      } else {
        var [i,slot] = dest.split(":");
        return port_code("n"+i+"_dest", slot);
      }
    }
    function port_code(dest, slot) {
      return "((("+dest+" << 4) | "+slot+") >>> 0)";
    }
    function info_code(kind) {
      return kind;
    }
    function flip_nodes(nodes) {
      var new_nodes = [];
      for (var i = 0; i < nodes.length; ++i) {
        new_nodes.push([]);
        for (var j = 0; j < nodes[i].length; ++j) {
          var word = nodes[i][j];
          if (is_external(nodes[i][j])) {
            word = word[0] === "<" ? word[1]+">" : "<"+word[0];
          }
          new_nodes[i].push(word);
        }
      }
      return new_nodes;
    }
    var statements = parse_sexp("("+code+")")[1];
    var kinds = {
      Air0: {name: "Air0", arity: 0, kind: 0},
      Air1: {name: "Air1", arity: 1, kind: 1},
      Air2: {name: "Air2", arity: 2, kind: 2},
      Air3: {name: "Air3", arity: 3, kind: 3},
      Air4: {name: "Air4", arity: 4, kind: 4},
      Air5: {name: "Air5", arity: 5, kind: 5},
      Air6: {name: "Air6", arity: 6, kind: 6},
      Air7: {name: "Air7", arity: 7, kind: 7},
      Air8: {name: "Air8", arity: 8, kind: 8},
      Air9: {name: "Air9", arity: 9, kind: 9},
      Air10: {name: "Air10", arity: 10, kind: 10},
      Air11: {name: "Air11", arity: 11, kind: 11},
      Air12: {name: "Air12", arity: 12, kind: 12},
      Air13: {name: "Air13", arity: 13, kind: 13},
      Air14: {name: "Air14", arity: 14, kind: 14},
      Air15: {name: "Air15", arity: 15, kind: 15},
      Rot: {name: "Rot", arity: 1, kind: 16},
      Era: {name: "Era", arity: 1, kind: 17},
    };
    var rules = [];
    var total_kinds = Object.keys(kinds).length;
    for (var statement of statements) {
      switch (statement[0]) {
        case "kind":
          var name = statement[1];
          var arity = Number(statement[2]);
          kinds[name] = {name, arity, kind: Object.keys(kinds).length};
          total_kinds++;
          break;
        case "rule":
          rules.push(statement);
          break;
        default:
          throw "Unknown statement: " + kinds[0];
      }
    }

    // Builds the erasure code for each kind
    var erasures = "";
    for (var k in kinds) {
      var a_kind = kinds[k];
      if (a_kind.kind >= 18) {
        erasures += "      case "+a_kind.kind+": // --" + a_kind.name+";\n";
        //erasures += "        console.log('--"+a_kind.name+"',a_dest);\n";
        erasures += "        // gets neighbors\n";
        for (var i = 1; i < a_kind.arity; ++i) {
          erasures += "        a_out"+i+" = mem.val[a_dest+1+"+i+"];\n";
        }
        erasures += "        // turns old node into air\n";
        erasures += "        mem.val[a_dest] = "+info_code(a_kind.arity)+";\n";
        erasures += "        // attaches eraser to neighbor ports\n";
        for (var i = 1; i < a_kind.arity; ++i) {
          erasures += "        mem.val[get_dest(a_out"+i+")+1+get_slot(a_out"+i+")] = a_out"+i+";\n";
        }
        //erasures += "        // creates new ants\n";
        //for (var i = 1; i < a_kind.arity; ++i) {
          //erasures += "        new_ant.push([a_out"+i+"]);\n";
        //}
        erasures += "        // checks external ports for redexes\n";
        for (var i = 1; i < a_kind.arity; ++i) {
          erasures += "        check_redex(mem, get_dest(a_out"+i+"));\n";
        }
        erasures += "        // frees memory used by node\n";
        erasures += "        free(mem, a_dest, "+(a_kind.arity+1)+");\n";
        erasures += "        return true;\n";
      }
    }


    // Builds the case code for each rule on the rule table
    var cases = "";
    for (var rule of rules) {

      // For both orientations of the rule
      for (var flipped = 0; flipped < 2; ++flipped) {
        // Flips rule if needed
        if (flipped === 0) {
          var a_name = rule[1];
          var b_name = rule[2];
          var nodes = rule.slice(3);
        } else {
          var a_name = rule[2];
          var b_name = rule[1];
          var nodes = flip_nodes(rule.slice(3));
        }

        // Skips if symmetric
        if (a_name === b_name && flipped === 1) {
          continue;
        }

        // Gets active pair kinds (ex: `{name: 'Add', arity: 3, kind: 4}`)
        var a_kind = kinds[a_name];
        var b_kind = kinds[b_name];

        // Builds map of linked ports, both internal and external.
        // Internal ports are represented as 'i:s'
        // - 'i' is the number of the new allocated node
        // - 's' is the slot
        // External ports are represented as 'xN'
        // - 'x' is 'a' if it is neighbor of the first active node, 'b' otherwise
        // - 's' is the slot of the active node that points to that port
        var links = {}; // internal connections
        for (var i = 0; i < nodes.length; ++i) {
          var node = nodes[i];
          if (kinds[node[0]]) {
            var vars = node.slice(1);
            for (var i_slot = 0; i_slot < vars.length; ++i_slot) {
              if (is_external(vars[i_slot])) { // external connection
                links[vars[i_slot]] = i+":"+i_slot;
                links[i+":"+i_slot] = vars[i_slot];
              } else { // internal connection
                if (!links[vars[i_slot]]) {
                  links[vars[i_slot]] = i+":"+i_slot;
                } else {
                  var [j,j_slot] = links[vars[i_slot]].split(":").map(Number);
                  delete links[vars[i_slot]];
                  links[i+":"+i_slot] = j+":"+j_slot;
                  links[j+":"+j_slot] = i+":"+i_slot;
                }
              }
            }
          } else {
            links[node[0]] = node[1];
            links[node[1]] = node[0];
          }
        }
        //console.log("NODES", nodes); 
        //console.log("LINKS", links);
        //process.exit();
        //console.log(kinds);

        // Builds the case code
        cases += "      case "+(b_kind.kind * total_kinds + a_kind.kind)+": // " + a_kind.name+"-"+b_kind.name+";\n";
        //cases += "        console.log('"+a_kind.name+"-"+b_kind.name+"');\n";
        cases += "        // gets neighbors\n";
        for (var i = 1; i < a_kind.arity; ++i) {
          cases += "        a_out"+i+" = mem.val[a_dest+1+"+i+"];\n"
        }
        for (var i = 1; i < b_kind.arity; ++i) {
          cases += "        b_out"+i+" = mem.val[b_dest+1+"+i+"];\n"
        }
        cases += "        // allocs new nodes\n";
        for (var i = 0; i < nodes.length; ++i) {
          var node = nodes[i];
          if (kinds[node[0]]) {
            cases += "        n"+i+"_dest = alloc(mem,"+(kinds[node[0]].arity+1)+");\n";
          }
        }
        cases += "        // fills new nodes\n";
        for (var i = 0; i < nodes.length; ++i) {
          var new_node = nodes[i];
          var new_kind = kinds[new_node[0]];
          if (new_kind) {
            cases += "        mem.val[n"+i+"_dest] = "+info_code(new_kind.kind)+";\n";
            for (var slot = 0; slot < new_kind.arity; ++slot) {
              var var_name = new_node[slot];
              cases += "        mem.val[n"+i+"_dest+1+"+slot+"] = "+dest_code(links[i+":"+slot])+";\n";
            }
          }
        }
        cases += "        // turns old nodes into air\n";
        cases += "        mem.val[a_dest] = "+info_code(a_kind.arity)+";\n";
        cases += "        mem.val[b_dest] = "+info_code(b_kind.arity)+";\n";
        cases += "        // points air ports to new destinations\n";
        for (var slot = 1; slot < a_kind.arity; ++slot) {
          cases += "        mem.val[a_dest+1+"+slot+"] = "+dest_code(links["<"+slot])+";\n";
        }
        for (var slot = 1; slot < b_kind.arity; ++slot) {
          cases += "        mem.val[b_dest+1+"+slot+"] = "+dest_code(links[slot+">"])+";\n";
        }
        cases += "        // attaches external ports\n";
        for (var slot = 1; slot < a_kind.arity; ++slot) {
          cases += "        attach(mem, a_out"+slot+");\n";
        }
        for (var slot = 1; slot < b_kind.arity; ++slot) {
          cases += "        attach(mem, b_out"+slot+");\n";
        }
        cases += "        // attaches internal ports that must point to external ports\n";
        for (var i = 0; i < nodes.length; ++i) {
          var node = nodes[i];
          if (kinds[node[0]]) {
            for (var slot = 0; slot < kinds[node[0]].arity; ++slot) {
              if (is_external(links[i+":"+slot])) {
                cases += "        attach(mem, "+dest_code(i+":"+slot)+");\n";
              }
            }
          }
        }
        cases += "        // checks new nodes for redexes\n";
        for (var i = 0; i < nodes.length; ++i) {
          if (kinds[node[0]]) {
            cases += "        check_redex(mem, n"+i+"_dest);\n";
          }
        }
        cases += "        // checks external ports for redexes\n";
        for (var slot = 1; slot < a_kind.arity; ++slot) {
          cases += "        check_redex(mem, get_dest(a_out"+slot+"));\n";
        }
        for (var slot = 1; slot < b_kind.arity; ++slot) {
          cases += "        check_redex(mem, get_dest(b_out"+slot+"));\n";
        }
        //for (var slot = 1; slot < a_kind.arity; ++slot) {
          //if (links["<"+slot] === "<"+slot) {
            //cases += "        new_ant.push(["+dest_code("<"+slot)+"]);\n";
          //}
        //}
        //for (var slot = 1; slot < b_kind.arity; ++slot) {
          //if (links[slot+">"] === slot+">") {
            //cases += "        new_ant.push(["+dest_code(slot+">")+"]);\n";
          //}
        //}
        cases += "        free(mem, a_dest, "+(a_kind.arity+1)+");\n";
        cases += "        free(mem, b_dest, "+(b_kind.arity+1)+");\n";
        cases += "        return true;\n";
      }
    }

    // Completes the kinds object
    for (var kind_name in kinds) {
      kinds[kinds[kind_name].kind] = kinds[kind_name];
    }

    var rewrite_source = [
      "(function rewrite(mem, a_dest, b_dest) {",
      "  var a_info, b_info, a_kind, b_kind;",
      "  var a_out1, a_out2, a_out3, a_out4, a_out5, a_out6, a_out7, a_out8;",
      "  var a_out1, b_out2, b_out3, b_out4, b_out5, b_out6, b_out7, b_out8;",
      "  var n0_dest, n1_dest, n2_dest, n3_dest, n4_dest, n5_dest, n6_dest, n7_dest;",
      "  a_info = mem.val[a_dest];",
      "  b_info = mem.val[b_dest];",
      "  a_kind = get_kind(a_info);",
      "  b_kind = get_kind(b_info);",
      "  // Performs erasure",
      "  if (a_dest === b_dest) {",
      "    switch (a_kind) {",
      erasures,
      "    }",
      "  } else {",
      "    // Performs reduction",
      "    switch (b_kind * "+total_kinds+" + a_kind) {",
      cases,
      "    }",
      "  }",
      "  return false;",
      "})",
    ].join("\n");

    
    //console.log(rewrite_source);
    var rewrite = eval(rewrite_source);
    //console.log(rewrite);
    //process.exit();

    return {cases, kinds, rewrite_source, rewrite};
  };

  var {kinds, rewrite} = build_rules(rules);

  function Memory() {
    return {
      val: [],
      ant: [],
      red: [],
      use: [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]],
      len: 0,
      rwt: 0,
    };
  }

  function alloc(mem, size) {
    var reused = mem.use[size].pop();
    if (reused) {
      return reused;
    } else {
      var dest = mem.len;
      mem.len += size;
      return dest;
    }
  }

  function free(mem, dest, size) {
    mem.use[size].push(dest);
  }

  function new_port(dest, slot) {
    return ((dest << 4) | slot) >>> 0;
  }

  function get_dest(port) {
    return port >>> 4;
  }

  function get_slot(port) {
    return port & 0xF;
  }

  // If port points to air, attach it to the next concrete node
  function attach(mem, port) {
    var next = mem.val[get_dest(port) + 1 + get_slot(port)];
    while (is_air(get_kind(mem.val[get_dest(next)]))) {
      //console.log("ue", next, get_dest(next), get_slot(next));
      next = mem.val[get_dest(next) + 1 + get_slot(next)];
    }
    //console.log("pointing", port, "to", next);
    mem.val[get_dest(port) + 1 + get_slot(port)] = next;
    //if (port <= next && get_slot(port) === 0 && get_slot(next) === 0) {
      //console.log("found redex", get_dest(port), get_dest(next));
      //mem.red.push(get_dest(port));
    //}
    //if (get_kind(mem.val[get_dest(next)]) === kinds.Era.kind) {
    //if (get_kind(mem.val[get_dest(port)]) === kinds.Era.kind) {
      //console.log("LINKED ERA");
    //}
  }

  // PortIsNum:16 | Done:1 | Kind:15 | 
  function new_info(kind, done, port_is_num = 0) {
    return ((port_is_num << 16) | (done << 15) | kind) >>> 0;
  }

  function port_is_num(info) {
    return 0; // TODO
  }

  function is_done(info) {
    return (info >>> 15) & 1;
  }

  function set_done(info) {
    return (info | (1 << 15)) >>> 0;
  }

  function get_kind(info) {
    return info & 0x7FFF;
  }

  function is_air(kind) {
    return kind < 16;
  }

  function reduce_step(mem) {
    //var new_ant = [];
    //for (var ant = 0; ant < mem.ant.length; ++ant) {
      //if (mem.ant[ant].length > 0) {
        //var prev = mem.ant[ant].pop();
        //var next = mem.val[get_dest(prev) + 1 + get_slot(prev)];
        //var next_info = mem.val[get_dest(next)];
        //var next_kind = get_kind(next_info);
        ////console.log("...", get_dest(prev), get_dest(next));
        ////var prev_info = mem.val[get_dest(prev)];
        ////var prev_kind = get_kind(prev_info);
        ////var prev_arit = kinds[prev_kind].arity;
        //// We're on air. Some ant reduced our node.
        //if (is_air(next_kind)) {
          //new_ant.push(mem.ant[ant]);
        //// We're on a node.
        //} else if (!is_done(next_info)) {
          //// On main port
          //if (get_slot(next) === 0) {
            //var rewritten = false;
            //// If active pair: perform rewrite, go back
            //if (get_slot(prev) === 0) {
              ////var neigs = [];
              ////// Collects neighbors
              ////console.log("...", prev_arit, next_arit);
              ////for (var slot = 2; slot <= prev_arit; ++slot) {
                ////neigs.push(mem.val[get_dest(prev) + slot]);
              ////}
              ////for (var slot = 2; slot <= next_arit; ++slot) {
                ////neigs.push(mem.val[get_dest(next) + slot]);
              ////}
              //// Rewrites
              //if (rewrite(mem, get_dest(prev), get_dest(next))) {
                //rewritten = true;
                //new_ant.push(mem.ant[ant]);
                ////console.log("new_ant_push", mem.ant[ant]);
                ////console.log("->", neigs.length);
                ////for (var n = 0; n < neigs.length; ++n) {
                  ////console.log("??", mem.val[get_dest(neigs[n]) + get_slot(neigs[n])], neigs[n]);
                  ////if (mem.val[neigs[n]] === neigs[n]) {
                    ////console.log("Attached an erase.");
                  ////}
                ////}
              //}
            //}
            //// If not active: mark node as done, go to its aux ports
            //if (!rewritten) {
              //mem.val[get_dest(next)] = set_done(next_info);
              //var next_arit = kinds[next_kind].arity;
              //for (var slot = 1; slot < next_arit; ++slot) {
                //new_ant.push([new_port(get_dest(next), slot)]);
              //}
            //}
          //// On aux port: push slot to back-array, go to main port
          //} else {
            //mem.ant[ant].push(prev);
            //mem.ant[ant].push(new_port(get_dest(next), 0));
            //new_ant.push(mem.ant[ant]);
          //}
        //}
      //}
    //}
    //mem.ant = new_ant;
    var red = mem.red;
    mem.red = [];
    for (var r = 0; r < red.length; ++r) {
      var a_dest = red[r];
      var a_out0 = mem.val[a_dest+1];
      var b_dest = get_dest(a_out0);
      var b_out0 = mem.val[b_dest+1];
      //var a_kind = get_kind(mem.val[a_dest]);
      //var b_kind = get_kind(mem.val[b_dest]);
      if (get_slot(a_out0) === 0 && get_slot(b_out0) === 0) {
        rewrite(mem, a_dest, b_dest);
      }
      mem.rwt += 1;
    }
  }

  //function check(mem, red) {
    //var good = true;
    //for (var dest = 0; dest < mem.val.length; dest = dest + arit + 1) {
      //var info = mem.val[dest];
      //var kind = get_kind(info);
      //var arit = kinds[kind].arity;
      //var main = mem.val[dest+1];
      //if (kind >= 18 && main === mem.val[get_dest(main)+1+get_slot(main)] && mem.red.indexOf(dest) === -1 && red.indexOf(dest) === -1) {
        //console.log("bad", dest);
        //good = false;
      //}
    //}
    //return good;
  //}

  function find_redexes(mem) {
    mem.red = [];
    for (var dest = 0; dest < mem.val.length; dest = dest + arit + 1) {
      var arit = kinds[get_kind(mem.val[dest])].arity;
      check_redex(mem, dest);
    }
  }

  function check_redex(mem, dest) {
    //console.log("check redex", dest);
    //if (dest === undefined) {
      //throw new Error("ue");
      //process.exit();
    //}
    var next = mem.val[dest+1];
    if (get_slot(next) === 0) {
      mem.red.push(dest);
    }
  }

  function read(code) {
    var mem = Memory();
    var vars = {};
    var lines = code.split("\n");
    for (var i = 0; i < lines.length; ++i) {
      if (lines[i] !== "") {
        var words = lines[i].split(" ").filter(x => x !== "");
        var name = words[0];
        var kind = kinds[name].kind;
        var ptr = alloc(mem, words.length);
        mem.val[ptr] = new_info(kind, 0);
        //console.log("->", name, kind, kinds);
        if (words.length !== kinds[kind].arity + 1) {
          throw "Wrong arity on " + kind + ": " + (words.length - 1) + " instead of " + kinds[kind].arity + ".";
        }
        for (var j = 0; j < kinds[kind].arity; ++j) {
          var dest = vars[words[j+1]];
          //console.log(i,j,JSON.stringify(vars));
          if (dest !== undefined) {
            mem.val[get_dest(dest)+1+get_slot(dest)] = new_port(ptr, j);
            mem.val[ptr+1+j] = dest;
          } else {
            vars[words[j+1]] = new_port(ptr, j);
            mem.val[ptr+1+j] = new_port(ptr, j);
          }
        }
      }
    };
    return mem;
  }

  function show(mem) {
    function nth_name(n) {
      var str = "";
      ++n;
      while (n > 0) {
        --n;
        str += String.fromCharCode(97 + n % 26);
        n = Math.floor(n / 26);
      }
      return str;
    };
    function padr(len, str) {
      return str.length >= len ? str : padr(len, str + " ");
    }
    function padl(len, str) {
      return str.length >= len ? str : padl(len, " " + str);
    }
    var has_ant = {};
    for (var ant = 0; ant < mem.ant.length; ++ant) {
      var ant_port = mem.ant[ant].slice(-1)[0];
      has_ant[get_dest(ant_port)+":"+get_slot(ant_port)] = true;
    }
    var lines = [];
    var names = {};
    var count = 0;
    var dest = 0;
    while (dest < mem.val.length) {
      var info = mem.val[dest];
      var kind = get_kind(info);
      //console.log(mem);
      //console.log("->", info, get_kind(info));
      var {name, arity} = kinds[get_kind(info)];
      if (!is_air(kind)) {
        var line = padr(5, name);
        for (var slot = 0; slot < arity; ++slot) {
          var self_port_key = dest+":"+slot;
          var dest_port_key = get_dest(mem.val[dest+1+slot])+":"+get_slot(mem.val[dest+1+slot]);
          if (self_port_key === dest_port_key) {
            var name = "@";
          } else {
            var name = names[self_port_key] || nth_name(count++);
          }
          var anty = has_ant[self_port_key] ? "*" : "";
          names[dest_port_key] = name;
          //var name = name + "-" + new_port(dest,slot);
          line = line + " " + padr(4, name.toUpperCase() + anty);
        }
        var done = is_done(info) ? "-" : " ";
        line = padl(4, String(dest)) + " |" + done + " " + line;
        line = (mem.red.indexOf(dest) !== -1 ? "#" : "|") + line;
        lines.push(line);
      }
      dest = dest + 1 + arity;
    }
    return "-----,\n" + lines.join("\n") + "\n-----'";
  }

  return {
    build_rules,
    Memory,
    alloc,
    free,
    new_port,
    get_dest,
    get_slot,
    attach,
    new_info,
    port_is_num,
    find_redexes,
    is_done,
    set_done,
    get_kind,
    is_air,
    rewrite,
    reduce_step,
    read,
    show,
  };
};
