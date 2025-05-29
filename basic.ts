import { error, parseBasic } from "npm:tiny-ts-parser";

type Term =
    | { tag: "true" }
    | { tag: "false" }
    | { tag: "if"; cond: Term; thn: Term; els: Term }
    | { tag: "number"; n: number }
    | { tag: "add"; left: Term; right: Term }
    | { tag: "var"; name: string }
    | { tag: "func"; params: Param[]; body: Term }
    | { tag: "call"; func: Term; args: Term[] }
    | { tag: "seq"; body: Term; rest: Term }
    | { tag: "const"; name: string; init: Term; rest: Term };

type Param = { name: string; type: Type };

type Type =
    | { tag: "Boolean" }
    | { tag: "Number" }
    | { tag: "Func"; params: Param[]; retType: Type };

type TypeEnv = Record<string, Type>;

function typecheck(t: Term, tyEnv: TypeEnv): Type {
    switch (t.tag) {
        case "true":
            return { tag: "Boolean" };
        case "false":
            return { tag: "Boolean" };
        case "if": {
            const condTy = typecheck(t.cond, tyEnv);
            if (condTy.tag !== "Boolean") error("boolean expected", t.cond);
            const thnTy = typecheck(t.thn, tyEnv);
            const elsTy = typecheck(t.els, tyEnv);
            if (!typeEq(thnTy, elsTy)) {
                error("then and else have different types", t);
            }
            return thnTy;
        }
        case "number":
            return { tag: "Number" };
        case "add": {
            const leftTy = typecheck(t.left, tyEnv);
            if (leftTy.tag !== "Number") error("number expected", t.left);
            const rightTy = typecheck(t.right, tyEnv);
            if (rightTy.tag !== "Number") error("number expected", t.right);
            return { tag: "Number" };
        }
        case "var": {
            if (!(t.name in tyEnv)) error(`unknown variable: ${t.name}`, t);
            return tyEnv[t.name];
        }
        case "func": {
            const newTyEnv = { ...tyEnv };
            for (const { name, type } of t.params) {
                newTyEnv[name] = type;
            }
            const retType = typecheck(t.body, newTyEnv);
            return { tag: "Func", params: t.params, retType };
        }
        case "call": {
            const funcTy = typecheck(t.func, tyEnv);
            if (funcTy.tag !== "Func") error("function expected", t.func);
            if (t.args.length !== funcTy.params.length) {
                error("wrong number of arguments", t);
            }
            for (let i = 0; i < t.args.length; i++) {
                const argTy = typecheck(t.args[i], tyEnv);
                if (!typeEq(argTy, funcTy.params[i].type)) {
                    error(
                        `parameter type mismatch: [${i}]: expected ${
                            funcTy.params[i].type.tag
                        }, got ${argTy.tag}`,
                        t.args[i],
                    );
                }
            }
            return funcTy.retType;
        }
        case "seq": {
            typecheck(t.body, tyEnv);
            return typecheck(t.rest, tyEnv);
        }
        case "const": {
            const ty = typecheck(t.init, tyEnv);
            const newTyEnv = { ...tyEnv, [t.name]: ty };
            return typecheck(t.rest, newTyEnv);
        }
    }
}

function typeEq(ty1: Type, ty2: Type): boolean {
    switch (ty2.tag) {
        case "Boolean":
            return ty1.tag === "Boolean";
        case "Number":
            return ty1.tag === "Number";
        case "Func": {
            if (ty1.tag !== "Func") return false;
            if (ty1.params.length !== ty2.params.length) return false;
            for (let i = 0; i < ty1.params.length; i++) {
                // 仮引数の name の一致は確認しない
                if (!typeEq(ty1.params[i].type, ty2.params[i].type)) {
                    return false;
                }
            }
            return typeEq(ty1.retType, ty2.retType);
        }
    }
}

function main() {
    // console.log(parseBasic("(f: (x: number) => number) => 1"));

    // console.log(typecheck(parseBasic("(x: boolean) => 42"), {}));
    // =>
    // {
    //   tag: "Func",
    //   params: [ { name: "x", type: { tag: "Boolean" } } ],
    //   retType: { tag: "Number" }
    // }

    // console.log(typecheck(parseBasic("(x: boolean) => x"), {}));
    // =>
    // {
    //   tag: "Func",
    //   params: [ { name: "x", type: { tag: "Boolean" } } ],
    //   retType: { tag: "Boolean" }
    // }

    // console.log(typecheck(parseBasic("((x: boolean) => x)(true)"), {}));
    // => { tag: "Boolean" }

    // console.log(typecheck(parseBasic("((x: boolean) => x)(42)"), {}));
    // => error: Uncaught (in promise) "parameter type mismatch: [0]: expected Boolean, got Number"

    console.log(typecheck(
        parseBasic(`
        const add = (x: number, y: number) => x + y;
        const select = (b: boolean, x: number, y: number) => b ? x : y;

        const x = add(1, add(2, 3));
        const y = select(true, x, x);

        y;
    `),
        {},
    ));
    // => { tag: "Number" }

    // console.log(typecheck(parseBasic(`
    //     const add = (x: number, y: number) => x + y;
    //     const select = (b: boolean, x: number, y: number) => b ? x : y;

    //     const  = add(1, add(2, 3));
    //     select(true, 1, 2);
    // `)))
}

main();
