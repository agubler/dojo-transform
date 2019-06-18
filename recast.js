const recast = fakeRequire('recast');
const types = fakeRequire('ast-types');
const compose = fakeRequire('recast/lib/util').composeSourceMaps;
const builders = types.builders;
const fs = fakeRequire('fs');
const globby = fakeRequire('globby');
const path = fakeRequire('path');

function sniff(content) {
	return content.indexOf('define(') > -1;
}

function isDefine(path) {
	return path.node.callee.name === 'define';
}

let errorCounter = 0;

function convert(content, file) {
	const ast = recast.parse(content, {});
	const visitors = {
		visitMemberExpression(path) {
			if (path.node.object.name === 'require') {
				path.node.object.name = 'fakeRequire';
			}
			this.traverse(path);
		},
		visitCallExpression(path) {

			// check callexpression with name of require

			if (isDefine(path)) {
				let defineCall = path.node;
				if (defineCall.arguments[0] && defineCall.arguments[1]) {

					let variableDeclarators = [];
					ast.program.body.pop();

					defineCall.arguments[0].elements.forEach((element, index) => {
						let paramName = defineCall.arguments[1].params[index] ? defineCall.arguments[1].params[index].name : 'noop';
						let elementValue = element.value;
						elementValue = elementValue.replace('./request/default!', './request/xhr');
						elementValue = elementValue.replace('selector/_loader!default', 'selector/lite');
						elementValue = elementValue.replace('selector/_loader', 'selector/lite');
						if (elementValue.indexOf('!') > -1) {
							elementValue = elementValue.replace(/.*\!/, '');
						}
						if (elementValue.indexOf('?') > -1) {
							elementValue = elementValue.replace(/.*\?/, '');
						}
						if (elementValue === 'config-deferredInstrumentation?./promise/instrumentation') {
							paramName = 'require';
						}

						if (paramName !== 'require' && paramName !== 'exports' && paramName !== 'module') {

							elementValue = elementValue.replace('host-browser?', '').replace('dom-addeventlistener?:', '').replace('dojo-bidi?', '').replace(/:/g, '');

							const b = builders.variableDeclarator(builders.identifier(paramName), builders.callExpression(builders.identifier('require'), [builders.literal(elementValue)]));
							const a = builders.variableDeclaration('var', [b]);
							variableDeclarators.push(a);
						}
					});

					const newBody = path.node.arguments[1].body.body
					if (newBody.length && newBody[newBody.length - 1].type === 'ReturnStatement') {
						const callExpression = newBody[newBody.length - 1].argument;
						const newExpression = builders.expressionStatement(builders.assignmentExpression('=', builders.memberExpression(builders.identifier('module'), builders.identifier('exports')), callExpression));
						newBody[newBody.length - 1] = newExpression;
					}
					ast.program.body = [ ...variableDeclarators, ...newBody ];
				} else if (defineCall.arguments[0] && defineCall.arguments[0].type === 'ObjectExpression') {
					const newExpression = builders.expressionStatement(builders.assignmentExpression('=', builders.memberExpression(builders.identifier('module'), builders.identifier('exports')), defineCall.arguments[0]));
					ast.program.body = [ newExpression ];
				}
			}

			if (path.node.callee.name === 'require') {
				path.node.callee.name = 'fakeRequire';
			}
			this.traverse(path);
		}
	};

	types.visit(ast, visitors);
	return ast;
}

function transform(content, file) {
	if (sniff(content)) {
		try {
			const ast = convert(content, file);

			const updatedContent = recast.print(ast).code;
			/*console.log(updatedContent);*/
			return updatedContent;
		} catch (e) {
			errorCounter++;
			console.log(file);
			console.log(e);
		}

		return content;
	}
}

const files = globby.sync([path.join(process.cwd(), '**', '*.js'), `!${path.join(process.cwd(), 'tests')}`]);

files.forEach((file) => {
	if (file.indexOf('tests') > -1) {
		/*console.log(file);*/
	} else {
		const source = fs.readFileSync(file);
		const newSource = transform(source, file);
		fs.writeFileSync(file, newSource, 'utf8');
	}
});

/*const source = fs.readFileSync('/Users/Anthony/development/sitepen/dijit/robot.js');
transform(source);*/

console.log('error count:', errorCounter);
/*transform(source);*/
