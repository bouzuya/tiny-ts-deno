// rec.ts is based on sub.ts and recfunc.ts
import { error, parseRec, typeShow } from "npm:tiny-ts-parser";

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
    | { tag: "Object"; props: PropertyType[] }
    | { tag: "Rec"; name: string; type: Type }
    | { tag: "TypeVar"; name: string };

type PropertyType = { name: string; type: Type };

type TypeEnv = Record<string, Type>;

function typecheck(t: Term, tyEnv: TypeEnv): Type {
    switch (t.tag) {
        case "true":
            return { tag: "Boolean" };
        case "false":
            return { tag: "Boolean" };
        case "if": {
            const condTy = simplifyType(typecheck(t.cond, tyEnv));
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
            const leftTy = simplifyType(typecheck(t.left, tyEnv));
            if (leftTy.tag !== "Number") error("number expected", t.left);
            const rightTy = simplifyType(typecheck(t.right, tyEnv));
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
            const funcTy = simplifyType(typecheck(t.func, tyEnv));
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
            const objectTy = simplifyType(typecheck(t.obj, tyEnv));
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
    return typeEqSub(ty1, ty2, []);
}

function typeEqNaive(
    ty1: Type,
    ty2: Type,
    map: Record<string, string>,
): boolean {
    switch (ty2.tag) {
        case "Boolean": // fallthrough
        case "Number":
            return ty1.tag === ty2.tag;
        case "Func": {
            if (ty1.tag !== "Func") return false;
            if (ty1.params.length !== ty2.params.length) return false;
            for (let i = 0; i < ty1.params.length; i++) {
                // 仮引数の name の一致は確認しない
                if (!typeEqNaive(ty1.params[i].type, ty2.params[i].type, map)) {
                    return false;
                }
            }
            return typeEqNaive(ty1.retType, ty2.retType, map);
        }
        case "Object": {
            if (ty1.tag !== "Object") return false;
            if (ty1.props.length !== ty2.props.length) return false;
            for (const prop2 of ty2.props) {
                const prop1 = ty1.props.find((p) => p.name === prop2.name);
                if (
                    prop1 === undefined ||
                    !typeEqNaive(prop1.type, prop2.type, map)
                ) {
                    return false;
                }
            }
            return true;
        }
        case "Rec": {
            if (ty1.tag !== "Rec") return false;
            const newMap = { ...map, [ty1.name]: ty2.name };
            return typeEqNaive(ty1.type, ty2.type, newMap);
        }
        case "TypeVar": {
            if (ty1.tag !== "TypeVar") return false;
            if (map[ty1.name] === undefined) {
                throw new Error(`unknown type variable: ${ty1.name}`);
            }
            return map[ty1.name] === ty2.name;
        }
    }
}

function expandType(ty: Type, tyVarName: string, repTy: Type): Type {
    switch (ty.tag) {
        case "Boolean": // fallthrough
        case "Number":
            return ty;
        case "Func": {
            const params = ty.params.map(({ name, type }) => ({
                name,
                type: expandType(type, tyVarName, repTy),
            }));
            const retType = expandType(ty.retType, tyVarName, repTy);
            return { tag: "Func", params, retType };
        }
        case "Object": {
            const props = ty.props.map(({ name, type }) => ({
                name,
                type: expandType(type, tyVarName, repTy),
            }));
            return { tag: "Object", props };
        }
        case "Rec": {
            if (ty.name === tyVarName) return ty;
            const newType = expandType(ty.type, tyVarName, repTy);
            return { tag: "Rec", name: ty.name, type: newType };
        }
        case "TypeVar": {
            return ty.name === tyVarName ? repTy : ty;
        }
    }
}

function simplifyType(ty: Type): Type {
    switch (ty.tag) {
        case "Rec":
            return simplifyType(expandType(ty.type, ty.name, ty));
        default:
            return ty;
    }
}

function typeEqSub(ty1: Type, ty2: Type, seen: [Type, Type][]): boolean {
    for (const [ty1_, ty2_] of seen) {
        if (typeEqNaive(ty1_, ty1, {}) && typeEqNaive(ty2_, ty2, {})) {
            return true;
        }
    }
    if (ty1.tag === "Rec") {
        return typeEqSub(simplifyType(ty1), ty2, [...seen, [ty1, ty2]]);
    }
    if (ty2.tag === "Rec") {
        return typeEqSub(ty1, simplifyType(ty2), [...seen, [ty1, ty2]]);
    }

    switch (ty2.tag) {
        case "Boolean": // fallthrough
        case "Number":
            return ty1.tag === ty2.tag;
        case "Func": {
            if (ty1.tag !== "Func") return false;
            if (ty1.params.length !== ty2.params.length) return false;
            for (let i = 0; i < ty1.params.length; i++) {
                // 仮引数の name の一致は確認しない
                if (
                    !typeEqSub(ty1.params[i].type, ty2.params[i].type, seen)
                ) {
                    return false;
                }
            }
            return typeEqSub(ty1.retType, ty2.retType, seen);
        }
        case "Object": {
            if (ty1.tag !== "Object") return false;
            if (ty1.props.length !== ty2.props.length) return false;
            for (const prop2 of ty2.props) {
                const prop1 = ty1.props.find((p) => p.name === prop2.name);
                if (
                    prop1 === undefined ||
                    !typeEqSub(prop1.type, prop2.type, seen)
                ) {
                    return false;
                }
            }
            return true;
        }
        case "TypeVar":
            throw "unreachable";
    }
}

function main() {
    console.dir(
        typecheck(
            parseRec(`
        type NumStream = { num: number; rest: () => NumStream };
        
        function numbers(n: number): NumStream {
            return { num: n, rest: () => numbers(n + 1) };
        }
        
        const ns1 = numbers(1);
        const ns2 = (ns1.rest)();
        const ns3 = (ns2.rest)();
        ns3
    `),
            {},
        ),
        { depth: null },
    );
    // console.log(typecheck(
    //     parseRec(`
    //         const x = { foo: 1, bar: true };
    //         x.foo;
    //     `),
    //     {},
    // ));
    // => { tag: "Number" }
}

main();
