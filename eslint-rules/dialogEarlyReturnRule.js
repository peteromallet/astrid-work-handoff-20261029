export const dialogEarlyReturnSelector =
  "IfStatement[test.type='UnaryExpression'][test.operator='!'][test.argument.type='Identifier'][test.argument.name=/^(open|isOpen)$/][consequent.type='ReturnStatement'][consequent.argument.type='Literal'][consequent.argument.value=null] + ReturnStatement[argument.type='JSXElement'][argument.openingElement.name.type='JSXIdentifier'][argument.openingElement.name.name='Dialog']";

export const dialogEarlyReturnMessage =
  "Do not early-return null above <Dialog open={...}>. Keep the Dialog mounted and gate DialogContent instead so Base UI cleanup runs on open=false.";

export const dialogEarlyReturnRestrictedSyntax = {
  selector: dialogEarlyReturnSelector,
  message: dialogEarlyReturnMessage,
};
