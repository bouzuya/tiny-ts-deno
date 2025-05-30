// sub.ts is based on obj.ts
import { error, parseSub } from "npm:tiny-ts-parser";

type Term =
    | { tag: "true" }
    | { tag: "false" }
    // | { tag: "if"; cond: Term; thn: Term; els: Term }
    | { tag: "number"; n: number }
    | { tag: "add"; left: Term; right: Term }
    | { tag: "var"; name: string }
    | { tag: "func"; params: Param[]; body: Term }
    | { tag: "call"; func: Term; args: Term[] }
    | { tag: "seq"; body: Term; rest: Term }
    | { tag: "const"; name: string; init: Term; rest: Term }
    | { tag: "objectNew"; props: PropertyTerm[] }
    | { tag: "objectGet"; obj: Term; propName: string };

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
        // case "if": {
        //     const condTy = typecheck(t.cond, tyEnv);
        //     if (condTy.tag !== "Boolean") error("boolean expected", t.cond);
        //     const thnTy = typecheck(t.thn, tyEnv);
        //     const elsTy = typecheck(t.els, tyEnv);
        //     if (!typeEq(thnTy, elsTy)) {
        //         error("then and else have different types", t);
        //     }
        //     return thnTy;
        // }
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
                if (!subtype(argTy, funcTy.params[i].type)) {
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
    }
}

function subtype(ty1: Type, ty2: Type): boolean {
    switch (ty2.tag) {
        case "Boolean":
            return ty1.tag === "Boolean";
        case "Number":
            return ty1.tag === "Number";
        case "Func": {
            if (ty1.tag !== "Func") return false;
            if (ty1.params.length !== ty2.params.length) return false;
            for (let i = 0; i < ty1.params.length; i++) {
                // 仮引数の name は同じでなくてもよい
                // 引数は反変 (contravariant)
                if (!subtype(ty2.params[i].type, ty1.params[i].type)) {
                    return false;
                }
            }
            // 戻り値は共変 (covariant)
            return subtype(ty1.retType, ty2.retType);
        }
        case "Object": {
            if (ty1.tag !== "Object") return false;
            // プロパティの個数は同じでなくてもよい
            // if (ty1.props.length !== ty2.props.length) return false;
            for (const prop2 of ty2.props) {
                const prop1 = ty1.props.find((p) => p.name === prop2.name);
                if (prop1 === undefined || !subtype(prop1.type, prop2.type)) {
                    return false;
                }
            }
            return true;
        }
    }
}

function main() {
    // console.log(typecheck(
    //     parseSub(`
    //         const f = (x: { foo: number }) => x.foo;
    //         const x = { foo: 1, bar: true };
    //         f(x);
    //     `),
    //     {},
    // ));
    // => { tag: "Number" }

    // console.log(typecheck(
    //     parseSub(`
    //         const f = (g: () => { foo: number; bar: boolean }) => g().bar;
    //         const g = () => ({ foo: 456 });
    //         f(g);
    //     `),
    //     {},
    // ));
    // => error: Uncaught (in promise) Error: test.ts:4:15-4:16 parameter type mismatch: [0]: expected Func, got Func

    console.log(typecheck(
        parseSub(`
            const x = { foo: 123, bar: { x: 456, y: true } };
            const f = (x: { foo: number; bar: { x: number } }) => x.bar.x;
            const g = (x: { foo: number; bar: { y: boolean } }) => x.bar.y;
            f(x);
            g(x);
        `),
        {},
    ));
    // => { tag: "Number" }
}

main();
