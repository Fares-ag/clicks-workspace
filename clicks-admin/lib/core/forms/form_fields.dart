import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../helper/phone_utils.dart';
import '../theme/admin_typography.dart';
import '../components/admin_page_scaffold.dart';

class PhoneInputField extends StatelessWidget {
  const PhoneInputField({
    super.key,
    required this.localDigits,
    required this.countryCode,
    required this.onLocalChanged,
    required this.onCountryChanged,
    this.error,
    this.enabled = true,
  });

  final String localDigits;
  final String countryCode;
  final ValueChanged<String> onLocalChanged;
  final ValueChanged<String> onCountryChanged;
  final String? error;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: DropdownButtonFormField<String>(
            value: normalizeCountryCode(countryCode),
            items: kCountryCodes
                .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                .toList(),
            onChanged: enabled ? (v) => onCountryChanged(v ?? defaultCountryCode) : null,
            decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 8)),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: TextFormField(
            initialValue: localDigits,
            enabled: enabled,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              hintText: localLengthHint(countryCode),
              errorText: error,
            ),
            onChanged: onLocalChanged,
          ),
        ),
      ],
    );
  }
}

class DateTimePickerField extends StatelessWidget {
  const DateTimePickerField({
    super.key,
    required this.value,
    required this.onChanged,
    this.label = 'Date & Time',
  });

  final DateTime? value;
  final ValueChanged<DateTime> onChanged;
  final String label;

  Future<void> _pick(BuildContext context) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: value ?? now,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !context.mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(value ?? now),
    );
    if (time == null) return;
    onChanged(DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  @override
  Widget build(BuildContext context) {
    final display = value == null
        ? ''
        : DateFormat('MMM d, y h:mm a').format(value!.toLocal());
    return InkWell(
      onTap: () => _pick(context),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: const Icon(Icons.calendar_today, size: 18),
        ),
        child: Text(
          display.isEmpty ? 'Select date and time' : display,
          style: AdminTypography.body.copyWith(
            color: display.isEmpty ? Colors.grey : null,
          ),
        ),
      ),
    );
  }
}

class AdminDropdown<T> extends StatelessWidget {
  const AdminDropdown({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.itemLabel,
    required this.onChanged,
    this.required = false,
  });

  final String label;
  final T? value;
  final List<T> items;
  final String Function(T) itemLabel;
  final ValueChanged<T?> onChanged;
  final bool required;

  @override
  Widget build(BuildContext context) {
    return AdminLabeledField(
      label: label,
      required: required,
      child: DropdownButtonFormField<T>(
        value: value,
        isExpanded: true,
        items: items
            .map((item) => DropdownMenuItem(
                  value: item,
                  child: Text(itemLabel(item), overflow: TextOverflow.ellipsis),
                ))
            .toList(),
        onChanged: onChanged,
        decoration: const InputDecoration(),
      ),
    );
  }
}
