import { error, parseRecFunc } from "npm:tiny-ts-parser";

type Term =
    | { tag: "true" }
    | { tag: "false" }
    | { tag: "if"; cond: Term; thn: Term; els: Term }
    | { tag: "number"; n: number }
    | { tag: "add"; left: Term; right: Term }
    | { tag: "var"; name: string }
    | { tag: "func"; params: Param[]; body: Term; retType?: Type }
    | { tag: "call"; func: Term; args: Term[] }
    | { tag: "seq"; body: Term; rest: Term }
    | { tag: "const"; name: string; init: Term; rest: Term }
    | { tag: "objectNew"; props: PropertyTerm[] }
    | { tag: "objectGet"; obj: Term; propName: string }
    | {
        tag: "recFunc";
        funcName: string;
        params: Param[];
        retType: Type;
        body: Term;
        rest: Term;
    };

type Param = { name: string; type: Type };

type PropertyTerm = { name: string; term: Term };

type Type =
    | { tag: "Boolean" }
    | { tag: "Number" }
    | { tag: "Func"; params: Param[]; retType: Type }
    | { tag: "Object"; props: PropertyType[] };

type PropertyType = { name: string; type: Type };

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
            if (t.retType !== undefined && !typeEq(t.retType, retType)) {
                error("wrong return type", t.retType);
            }
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
        case "objectNew": {
            const props = t.props.map(({ name, term }) => ({
                name,
                type: typecheck(term, tyEnv),
            }));
            return { tag: "Object", props };
        }
        case "objectGet": {
            const objectTy = typecheck(t.obj, tyEnv);
            if (objectTy.tag !== "Object") error("object expected", t.obj);
            const prop = objectTy.props.find((p) => p.name === t.propName);
            if (prop === undefined) error(`unknown property: ${t.propName}`, t);
            return prop.type;
        }
        case "recFunc": {
            const funcTy: Type = {
                tag: "Func",
                params: t.params,
                retType: t.retType,
            };
            const newTyEnv: TypeEnv = { ...tyEnv, [t.funcName]: funcTy };
            for (const { name, type } of t.params) {
                newTyEnv[name] = type;
            }
            const retType = typecheck(t.body, newTyEnv);
            if (!typeEq(t.retType, retType)) error("wrong return type", t);
            const newTyEnv2 = { ...newTyEnv, [t.funcName]: funcTy };
            return typecheck(t.rest, newTyEnv2);
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
        case "Object": {
            if (ty1.tag !== "Object") return false;
            if (ty1.props.length !== ty2.props.length) return false;
            for (const prop2 of ty2.props) {
                const prop1 = ty1.props.find((p) => p.name === prop2.name);
                if (prop1 === undefined || !typeEq(prop1.type, prop2.type)) {
                    return false;
                }
            }
            return true;
        }
    }
}

function main() {
    // console.log(typecheck(
    //     parseRecFunc(`function f(x: number): number { return f(x); }; f`),
    //     {},
    // ));
    // =>
    // {
    //   tag: "Func",
    //   params: [ { name: "x", type: { tag: "Number" } } ],
    //   retType: { tag: "Number" }
    // }

    // console.log(typecheck(
    //     parseRecFunc(`function f(x: number): number { return f(x); }; f(0)`),
    //     {},
    // ));
    // => { tag: "Number" }

    // console.log(typecheck(
    //     parseRecFunc(`(n: number) => 42`),
    //     {},
    // ));
    // =>
    // {
    //   tag: "Func",
    //   params: [ { name: "n", type: { tag: "Number" } } ],
    //   retType: { tag: "Number" }
    // }

    // console.log(typecheck(
    //     parseRecFunc(`(n: number): number => 42`),
    //     {},
    // ));
    // =>
    // {
    //   tag: "Func",
    //   params: [ { name: "n", type: { tag: "Number" } } ],
    //   retType: { tag: "Number" }
    // }

    console.log(typecheck(
        parseRecFunc(`(n: number): boolean => 42`),
        {},
    ));
    // => error: Uncaught (in promise) Error: wrong return type
}

main();
