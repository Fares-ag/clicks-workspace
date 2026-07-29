import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import '../helper/validation_helper.dart';
import '../theme/colors_manager.dart';
import '../theme/text_styles.dart';

/// Enum representing different types of text fields with associated validation rules.
///
/// - [email]: Validates email format
/// - [password]: Obscures text and enforces security requirements
/// - [text]: Allows alphabetical characters (including Arabic) and spaces
/// - [number]: Allows numeric input only
/// - [phone]: Validates phone numbers (digits only with length restrictions)
/// - [name]: Allows alphabetical characters with special denials for symbols/numbers
/// - [price]: Allows decimal numbers with 2 decimal places
/// - [any]: No format restrictions
enum AppTextFieldType { email, password, text, number, phone, name, price, any }

/// A highly customizable text form field widget with built-in validation and localization support.
///
/// Features include:
/// - Multiple input types with automatic validation
/// - Customizable styling and layout
/// - Internationalization support via EasyLocalization
/// - Automatic keyboard type selection
/// - Input formatting and length restrictions
/// - Password obscuring
/// - Custom validation support
class AppTextFormField extends StatefulWidget {
  /// Padding for the content inside the text field
  final EdgeInsetsGeometry? contentPadding;

  /// Border style when focused
  final InputBorder? focusedBorder;

  /// Border style when enabled
  final InputBorder? enabledBorder;

  /// Style for input text
  final TextStyle? inputTextStyle;

  /// Style for hint text
  final TextStyle? hintStyle;

  /// Localized hint text key
  final String hintText;

  /// Optional label text displayed above the field
  final String? nameText;

  /// Style for label text
  final TextStyle? nameTextStyle;

  /// Whether to obscure text (for passwords)
  final bool? isObscureText;

  /// Suffix icon widget
  final Widget? suffixIcon;

  /// Prefix icon widget
  final Widget? prefixIcon;

  /// Background color of the text field
  final Color? backgroundColor;

  /// Cursor color of the text field
  final Color? cursorColor;

  /// Text editing controller
  final TextEditingController? controller;

  /// Maximum number of lines (default: 1)
  final int? maxLines;

  /// Custom validation function (overrides default type-based validation)
  final Function(String?)? validator;

  final bool? isDefaultValidation;

  /// Field type determining validation and formatting
  final AppTextFieldType type;

  /// Keyboard type (defaults based on field type)
  final TextInputType? keyboardType;

  /// Additional input formatters
  final List<TextInputFormatter>? inputFormatters;

  /// Callback for text changes
  final Function(String)? onChanged;

  /// Whether the field is interactive (default: true)
  final bool enabled;

  /// Country code for phone validation (currently placeholder)
  final String countryCode;

  /// Whether to autofocus on init
  final bool? autoFocus;

  /// Maximum allowed characters
  final int? maxChar;

  /// Tap callback (makes field read-only when set)
  final Function()? onTap;

  final FocusNode? focusNode;

  /// Creates a customizable text form field with built-in validation
  /// // if TextEditingController is null initialize it in the parent widget
  AppTextFormField({
    super.key,
    this.contentPadding,
    this.keyboardType,
    this.onChanged,
    this.focusedBorder,
    this.enabledBorder,
    this.inputTextStyle,
    this.autoFocus,
    this.prefixIcon,
    this.hintStyle,
    this.nameText,
    this.nameTextStyle,
    this.inputFormatters,
    required this.hintText,
    this.isObscureText,
    this.suffixIcon,
    this.backgroundColor,
    this.cursorColor,
    TextEditingController? controller,
    this.enabled = true,
    this.maxLines = 1,
    this.countryCode = 'SA',
    this.maxChar,
    this.onTap,
    required this.type,
    this.validator,
    this.isDefaultValidation,
    this.focusNode,
  }) : controller = controller ?? TextEditingController();

  @override
  State<AppTextFormField> createState() => _AppTextFormFieldState();
}

class _AppTextFormFieldState extends State<AppTextFormField> {
  bool passVisible = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.nameText != null)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 10.h, horizontal: 0.w),
            child: Text(
              widget.nameText!,
              style: widget.nameTextStyle ?? TextStyles.font12RegularBlack,
            ),
          ),
        TextFormField(
          focusNode: widget.focusNode,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          onTap: widget.onTap,
          obscuringCharacter: "*",
          readOnly: widget.onTap != null || !widget.enabled,
          controller: widget.controller,
          maxLines: widget.maxLines,
          autofocus: widget.autoFocus ?? false,
          keyboardType: widget.keyboardType ?? _customKeyBoard(widget.type),
          inputFormatters: [
            ..._customRegex(widget.type, widget.maxChar) ?? [],
            ...widget.inputFormatters ?? [],
          ],
          onChanged: widget.onChanged,
          cursorColor: widget.cursorColor,
          decoration: InputDecoration(
            prefixIcon: widget.prefixIcon,
            // label: Text(nameText ?? hintText),
            isDense: true,
            labelStyle: widget.hintStyle ?? TextStyles.font14RegularGrey,
            // labelText: widget.hintText,
            alignLabelWithHint: true,
            floatingLabelStyle: widget.hintStyle ?? TextStyles.font14Regular,
            floatingLabelBehavior: FloatingLabelBehavior.auto,
            contentPadding:
                widget.contentPadding ??
                EdgeInsets.symmetric(horizontal: 16.w, vertical: 14.h),

            /// Updated hint style to match the design
            hintStyle:
                widget.hintStyle ??
                TextStyles.font16RegularBlack.copyWith(
                  color: ColorsManager.hintColor,
                ),
            hintText: widget.hintText,
            suffixIcon:
                widget.type == AppTextFieldType.password
                    ? IconButton(
                      onPressed: () {
                        setState(() {
                          setState(() {
                            passVisible = !passVisible;
                          });
                        });
                      },
                      icon: Icon(
                        passVisible ? Icons.visibility_off : Icons.visibility,
                        color: Colors.grey,
                      ),
                    )
                    : widget.suffixIcon,
            fillColor: widget.backgroundColor ?? ColorsManager.border,
            filled: widget.backgroundColor != null,
            border:
                widget.enabledBorder ??
                OutlineInputBorder(
                  borderSide: BorderSide(color: ColorsManager.border, width: 1),
                  borderRadius: BorderRadius.circular(8.0),
                ),
            focusedBorder:
                widget.focusedBorder ??
                OutlineInputBorder(
                  borderSide: BorderSide(color: ColorsManager.border, width: 1),
                  borderRadius: BorderRadius.circular(8.0),
                ),
            enabledBorder:
                widget.enabledBorder ??
                OutlineInputBorder(
                  borderSide: BorderSide(color: ColorsManager.border, width: 1),
                  borderRadius: BorderRadius.circular(8.0),
                ),
          ),

          obscureText: widget.type == AppTextFieldType.password && !passVisible,
          style: widget.inputTextStyle ?? TextStyles.font12RegularBlack,

          /// Added validator to check if the field is empty
          /// must add [ validator: (_){} ] when using this widget to apply the validation
          validator:
              widget.isDefaultValidation ?? true
                  ? (value) {
                    if (value == null || value.trim().isEmpty) {
                      // return "${LocaleKeys.pleaseEnterAValue.tr()} ${nameText?.tr() ?? hintText.tr()}";
                      return "Please enter ${widget.nameText ?? widget.hintText}";
                    } else if (!ValidationHelper.validate(
                      value.trim(),
                      widget.type,
                    )) {
                      if (widget.type == AppTextFieldType.password) {
                        // uppercase, lowercase, number, symbol , 8
                        return "Password must contain at least 8 characters,\n one uppercase letter, one lowercase letter,\n one number, and one special character";
                      }
                      // return " ${LocaleKeys.pleaseEnter.tr()} ${nameText?.tr() ?? hintText.tr()} ${LocaleKeys.Valid.tr()}";
                      return "Please enter a valid ${widget.nameText ?? widget.hintText}";
                    }

                    return widget.validator?.call(value.trim());
                  }
                  : (value) {
                    return widget.validator?.call(value);
                  },
        ),
      ],
    );
  }

  // Color _getBorderColor(String? value, dynamic country) {
  //   final error = _getErrorMessage(value, country);
  //   return error == null
  //       ? ColorsManager.border
  //       : Colors.red; // Green if valid, red if invalid
  // }

  // String? _getErrorMessage(String? value, dynamic country) {
  //   if (value == null || value.trim().isEmpty) {
  //     return "Please enter a phone number";
  //   } else if (!country.isValidPhoneNumber(value.trim())) {
  //     return "Please enter a valid phone number";
  //   } else if (country.code.toLowerCase() == "eg" &&
  //       !["10", "11", "12", "15"].contains(value.trim().substring(0, 2))) {
  //     return "Invalid area code";
  //   } else if (country.code.toLowerCase() == "sa" && !value.startsWith("5")) {
  //     return "Invalid area code";
  //   }
  //   return null; // No error
  // }

  /// Returns a list of input formatters based on the text field type.
  _customRegex(AppTextFieldType type, int? max) {
    switch (type) {
      case AppTextFieldType.email:
        return [
          FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9@_.]+')),
          LengthLimitingTextInputFormatter(max ?? 250),
        ];
      case AppTextFieldType.password:
        // return [LengthLimitingTextInputFormatter(max ?? 200)];
        return [LengthLimitingTextInputFormatter(max ?? 40)];
      case AppTextFieldType.text:
        return [
          // FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z\u0600-\u06FF ]+')),
          //deny special characters
          LengthLimitingTextInputFormatter(max ?? 1000),
        ];
      case AppTextFieldType.number:
        return [
          // FilteringTextInputFormatter.allow(RegExp(r'[0-9]+')),
          LengthLimitingTextInputFormatter(max ?? 250),
        ];
      case AppTextFieldType.phone:
        return [
          FilteringTextInputFormatter.allow(RegExp(r'^\+?[0-9]*')),
          LengthLimitingTextInputFormatter(max ?? 12),
        ];
      case AppTextFieldType.name:
        return [
          FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z\u0600-\u06FF ]+')),
          FilteringTextInputFormatter.deny(
            RegExp(r'[!@#<>?":_`~;[\]\\|=+)(*&^%0-9-]'),
          ),
          FilteringTextInputFormatter.deny(
            RegExp(r'[!@#<>؟"؛٪:_`~;[\]\\|=+)(*&^%0-9-]'),
          ),
          FilteringTextInputFormatter.deny(RegExp(r'[٠١٢٣٤٥٦٧٨٩]')),
          LengthLimitingTextInputFormatter(max ?? 50),
        ];
      case AppTextFieldType.price:
        return [
          FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
          LengthLimitingTextInputFormatter(max ?? 14),
        ];
      case AppTextFieldType.any:
        return null;
    }
  }

  /// Returns the appropriate keyboard type based on the text field type.
  _customKeyBoard(AppTextFieldType type) {
    const keyboardMapping = {
      AppTextFieldType.email: TextInputType.emailAddress,
      AppTextFieldType.password: TextInputType.visiblePassword,
      AppTextFieldType.text: TextInputType.text,
      AppTextFieldType.number: TextInputType.number,
      AppTextFieldType.phone: TextInputType.phone,
      AppTextFieldType.name: TextInputType.text,
      AppTextFieldType.price: TextInputType.number,
      AppTextFieldType.any: TextInputType.text,
    };
    return keyboardMapping[type] ?? TextInputType.text;
  }
}
