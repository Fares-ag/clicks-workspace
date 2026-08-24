import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../core/constants/job_types.dart';
import '../../core/components/vehicle_make_model_fields.dart';
import '../../core/helper/phone_utils.dart';
import '../../core/theme/app_colors.dart';
import 'jobs_cubit.dart';

class NewJobScreen extends StatefulWidget {
  const NewJobScreen({super.key});

  @override
  State<NewJobScreen> createState() => _NewJobScreenState();
}

class _NewJobScreenState extends State<NewJobScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _yearCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _vinCtrl = TextEditingController();
  final _issueCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _makeCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _vehicleKey = GlobalKey<VehicleMakeModelFieldsState>();

  final String _countryCode = defaultCountryCode;
  bool _useCatalog = true;
  String? _jobType = kJobTypes.first.value;
  DateTime? _dateTime;
  String? _phoneError;
  bool _locating = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _yearCtrl.dispose();
    _plateCtrl.dispose();
    _vinCtrl.dispose();
    _issueCtrl.dispose();
    _locationCtrl.dispose();
    _priceCtrl.dispose();
    _makeCtrl.dispose();
    _modelCtrl.dispose();
    super.dispose();
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Location permission denied')),
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      _locationCtrl.text =
          '${pos.latitude.toStringAsFixed(6)}, ${pos.longitude.toStringAsFixed(6)}';
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not get location: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _onPhoneChanged(String value) {
    final local = toLocalDigits(value, _countryCode);
    if (_phoneCtrl.text != local) {
      _phoneCtrl.value = TextEditingValue(
        text: local,
        selection: TextSelection.collapsed(offset: local.length),
      );
    }
    setState(() {
      if (local.isNotEmpty && !isValidLocalPhone(local)) {
        _phoneError = 'Enter the 8-digit local number (without +974)';
      } else {
        _phoneError = null;
      }
    });
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _dateTime ?? now,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 2),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_dateTime ?? now),
    );
    if (time == null || !mounted) return;
    setState(() {
      _dateTime = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => JobsCubit(),
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: AppColors.surface,
          elevation: 0,
          title: Text(
            'New Request',
            style: GoogleFonts.dmSans(
              fontWeight: FontWeight.w700,
              color: AppColors.text,
            ),
          ),
          iconTheme: const IconThemeData(color: AppColors.text),
        ),
        body: BlocConsumer<JobsCubit, JobsState>(
          listener: (context, state) {
            if (state is JobsCreateSuccess) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Request submitted — Clicks will review and assign a technician',
                  ),
                ),
              );
              Navigator.of(context).pop(true);
            } else if (state is JobsError) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(state.message)),
              );
            }
          },
          builder: (context, state) {
            final loading = state is JobsSubmitting;

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _sectionTitle('Client Details'),
                    _field(_nameCtrl, 'Client Name*', validator: _req),
                    const SizedBox(height: 12),
                    _phoneField(),
                    const SizedBox(height: 12),
                    _field(
                      _emailCtrl,
                      'Client Email Address',
                      keyboard: TextInputType.emailAddress,
                    ),
                    const SizedBox(height: 12),
                    VehicleMakeModelFields(
                      key: _vehicleKey,
                      onCatalogReady: (ok) => setState(() => _useCatalog = ok),
                    ),
                    if (!_useCatalog) ...[
                      const SizedBox(height: 12),
                      VehicleMakeModelTextFields(
                        makeController: _makeCtrl,
                        modelController: _modelCtrl,
                      ),
                    ],
                    const SizedBox(height: 12),
                    _field(
                      _yearCtrl,
                      'Vehicle Year',
                      keyboard: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                    ),
                    const SizedBox(height: 12),
                    _field(_plateCtrl, 'License Plate'),
                    const SizedBox(height: 12),
                    _field(_vinCtrl, 'VIN Number'),
                    const SizedBox(height: 24),
                    _sectionTitle('Job Details'),
                    _field(
                      _locationCtrl,
                      'Location*',
                      maxLines: 2,
                      validator: _req,
                      helperText:
                          'Address, lat/lng, or Google Maps / Waze link',
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: _locating ? null : _useCurrentLocation,
                        icon: _locating
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.my_location, size: 18),
                        label: Text(
                          _locating ? 'Getting location…' : 'Use current location',
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: _pickDateTime,
                      child: InputDecorator(
                        decoration: _dec('Date & Time*').copyWith(
                          suffixIcon: const Icon(Icons.calendar_today_outlined),
                        ),
                        child: Text(
                          _dateTime == null
                              ? 'Select date and time'
                              : DateFormat('MMM d, yyyy h:mm a')
                                  .format(_dateTime!),
                          style: GoogleFonts.dmSans(
                            color: _dateTime == null
                                ? AppColors.muted
                                : AppColors.text,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _dropdown<String>(
                      label: 'Type of Job*',
                      value: _jobType,
                      hint: 'Select Job Type',
                      items: kJobTypes.map((t) => t.value).toList(),
                      itemLabel: (value) {
                        for (final t in kJobTypes) {
                          if (t.value == value) return t.label;
                        }
                        return value;
                      },
                      onChanged: (v) => setState(() => _jobType = v),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'Required' : null,
                    ),
                    const SizedBox(height: 12),
                    _field(
                      _priceCtrl,
                      'Price*',
                      keyboard: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                      ],
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Required';
                        final p = double.tryParse(v.trim());
                        if (p == null || !p.isFinite || p <= 0) {
                          return 'Enter a price greater than 0';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    _field(
                      _issueCtrl,
                      'Issue*',
                      maxLines: 4,
                      validator: _req,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Clicks reviews each request and assigns a technician.',
                      style: GoogleFonts.dmSans(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                    const SizedBox(height: 28),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      onPressed: loading
                          ? null
                          : () {
                              final phoneOk = isValidLocalPhone(
                                toLocalDigits(_phoneCtrl.text, _countryCode),
                              );
                              if (_dateTime == null) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Date & time is required'),
                                  ),
                                );
                                return;
                              }
                              if (!phoneOk) {
                                setState(() {
                                  _phoneError =
                                      'Phone number must be exactly 8 digits (without country code)';
                                });
                                return;
                              }
                              if (!_formKey.currentState!.validate()) return;
                              final yearRaw = _yearCtrl.text.trim();
                              final vs = _vehicleKey.currentState;
                              final make = _useCatalog && vs != null
                                  ? vs.make
                                  : _makeCtrl.text.trim();
                              final model = _useCatalog && vs != null
                                  ? vs.model
                                  : _modelCtrl.text.trim();
                              if (make.isEmpty || model.isEmpty) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'Vehicle make and model are required',
                                    ),
                                  ),
                                );
                                return;
                              }
                              context.read<JobsCubit>().createJob(
                                    clientName: _nameCtrl.text,
                                    clientMobileLocal: _phoneCtrl.text,
                                    countryCode: _countryCode,
                                    clientEmail: _emailCtrl.text,
                                    vehicleMake: make,
                                    vehicleModel: model,
                                    vehicleYear: yearRaw.isEmpty
                                        ? null
                                        : int.tryParse(yearRaw),
                                    licensePlate: _plateCtrl.text,
                                    vinNumber: _vinCtrl.text,
                                    issue: _issueCtrl.text,
                                    location: _locationCtrl.text,
                                    jobType: _jobType!,
                                    price: double.parse(
                                      _priceCtrl.text.trim(),
                                    ),
                                    dateTime: _dateTime!,
                                  );
                            },
                      child: loading
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              'Submit request',
                              style: GoogleFonts.dmSans(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title,
        style: GoogleFonts.dmSans(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: AppColors.text,
        ),
      ),
    );
  }

  Widget _phoneField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 96,
              child: InputDecorator(
                decoration: _dec('Code'),
                child: Text(
                  _countryCode,
                  style: GoogleFonts.dmSans(fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(8),
                ],
                onChanged: _onPhoneChanged,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Required';
                  if (!isValidLocalPhone(toLocalDigits(v, _countryCode))) {
                    return 'Must be 8 digits';
                  }
                  return null;
                },
                decoration: _dec('Client Phone Number*').copyWith(
                  errorText: _phoneError,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _dropdown<T extends String>({
    required String label,
    required T? value,
    required String hint,
    required List<T> items,
    required ValueChanged<T?> onChanged,
    String Function(T)? itemLabel,
    String? Function(T?)? validator,
    bool enabled = true,
  }) {
    return DropdownButtonFormField<T>(
      value: value != null && items.contains(value) ? value : null,
      decoration: _dec(label),
      hint: Text(hint, style: GoogleFonts.dmSans(color: AppColors.muted)),
      items: items
          .map(
            (t) => DropdownMenuItem(
              value: t,
              child: Text(itemLabel?.call(t) ?? t),
            ),
          )
          .toList(),
      onChanged: enabled ? onChanged : null,
      validator: validator,
    );
  }

  String? _req(String? v) =>
      (v == null || v.trim().isEmpty) ? 'Required' : null;

  Widget _field(
    TextEditingController ctrl,
    String hint, {
    TextInputType? keyboard,
    int maxLines = 1,
    String? Function(String?)? validator,
    List<TextInputFormatter>? inputFormatters,
    String? helperText,
  }) {
    return TextFormField(
      controller: ctrl,
      keyboardType: keyboard,
      maxLines: maxLines,
      validator: validator,
      inputFormatters: inputFormatters,
      decoration: _dec(hint, helperText: helperText),
    );
  }

  InputDecoration _dec(String hint, {String? helperText}) {
    return InputDecoration(
      labelText: hint,
      helperText: helperText,
      helperMaxLines: 2,
      filled: true,
      fillColor: AppColors.field,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }
}
