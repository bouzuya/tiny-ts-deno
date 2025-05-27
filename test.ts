import { parseArith } from "npm:tiny-ts-parser";

console.log(parseArith("100"));

// code 2.1
// 1 + 2
const _code_2_1 = {
    tag: "add",
    left: { tag: "number", n: 1 },
    right: { tag: "number", n: 2 },
};

// code 2.2
type Term =
    | { tag: "true" }
    | { tag: "false" }
    | { tag: "if"; cond: Term; thn: Term; els: Term }
    | { tag: "number"; n: number }
    | { tag: "add"; left: Term; right: Term; };

// code 2.3
console.log(parseArith("1 + 2"));

type Type =
    | { tag: "Boolean" }
    | { tag: "Number" };

function typecheck(t: Term): Type {
    switch (t.tag) {
        case "true":
            return { tag: "Boolean" };
        case "false":
            return { tag: "Boolean" };
        case "if": {
            throw new Error("TODO");
        }
        case "number":
            return { tag: "Number" };
        case "add": {
            throw new Error("TODO");
        }
    }
}
