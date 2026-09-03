import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_card.dart';
import '../../core/components/admin_detail_header.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/components/admin_page_scaffold.dart';
import '../../core/forms/form_fields.dart';
import '../../core/helper/phone_utils.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

class AddLeadScreen extends StatefulWidget {
  const AddLeadScreen({super.key, this.serviceRequestData});
  final Map<String, dynamic>? serviceRequestData;

  @override
  State<AddLeadScreen> createState() => _AddLeadScreenState();
}

class _AddLeadScreenState extends State<AddLeadScreen> {
  final _clientName = TextEditingController();
  final _email = TextEditingController();
  final _inquiry = TextEditingController();
  final _notes = TextEditingController();
  final _location = TextEditingController();
  final _year = TextEditingController();
  final _plate = TextEditingController();

  String _countryCode = defaultCountryCode;
  String _localPhone = '';
  String? _phoneError;
  String? _sourceId;
  String? _subSourceId;
  String? _make;
  String? _model;
  bool _saving = false;

  List<Map<String, dynamic>> _sources = [];
  List<Map<String, dynamic>> _makes = [];
  String? _customerId;
  String? _customerVehicleId;
  String? _serviceRequestId;

  @override
  void initState() {
    super.initState();
    _loadMeta().then((_) => _prefillFromSr());
  }

  Future<void> _loadMeta() async {
    final results = await Future.wait([
      DioHelper.getData(url: EndPoints.sources),
      DioHelper.getData(url: EndPoints.vehicleMakes),
    ]);
    if (!mounted) return;
    setState(() {
      _sources = _listFrom(results[0].data, 'sources');
      _makes = _listFrom(results[1].data, 'makes');
    });
  }

  List<Map<String, dynamic>> _listFrom(dynamic data, String key) {
    if (data is! Map) return [];
    final list = data[key];
    if (list is! List) return [];
    return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  void _prefillFromSr() {
    final sr = widget.serviceRequestData;
    if (sr == null) return;
    final customer = sr['customer'];
    if (customer is Map) {
      _clientName.text = customer['name']?.toString() ?? '';
      _localPhone = toLocalDigits(customer['phone']?.toString() ?? '', _countryCode);
    }
    _customerId = sr['customer_id']?.toString();
    _customerVehicleId = sr['customer_vehicle_id']?.toString();
    _serviceRequestId =
        sr['service_request_id']?.toString() ?? sr['_id']?.toString() ?? sr['id']?.toString();
    _inquiry.text = sr['service_type']?.toString() ?? '';
    final vehicle = sr['vehicle'];
    if (vehicle is Map) {
      _make = vehicle['make']?.toString();
      _model = vehicle['model']?.toString();
      _year.text = vehicle['year']?.toString() ?? '';
      _plate.text = vehicle['plate']?.toString() ?? '';
    }
    final loc = sr['location'];
    if (loc is Map && loc['coordinates'] is List) {
      final coords = loc['coordinates'] as List;
      if (coords.length >= 2) {
        _location.text = '${coords[1]}, ${coords[0]}';
      }
    }
    for (final s in _sources) {
      final name = s['mainSourceName']?.toString().toLowerCase() ?? '';
      if (name == 'app' || name == 'mobile') {
        _sourceId = s['_id']?.toString();
        break;
      }
    }
    setState(() {});
  }

  Future<void> _save() async {
    if (_inquiry.text.trim().isEmpty || _clientName.text.trim().isEmpty) {
      _toast('Inquiry and client name are required');
      return;
    }
    if (_sourceId == null || _sourceId!.isEmpty) {
      _toast('Source is required');
      return;
    }
    if (!isValidLocalPhone(_localPhone, _countryCode)) {
      setState(() => _phoneError = 'Enter a valid phone number');
      return;
    }

    setState(() => _saving = true);
    try {
      final body = <String, dynamic>{
        'clientName': _clientName.text.trim(),
        'clientMobileNumber': toE164(_localPhone, _countryCode),
        'clientEmail': _email.text.trim(),
        'inquiry': _inquiry.text.trim(),
        'internalNotes': _notes.text.trim(),
        'location': _location.text.trim(),
        'source': _sourceId,
        if (_subSourceId != null) 'subSource': _subSourceId,
        if (_make != null) 'vehicleMake': _make,
        if (_model != null) 'vehicleModel': _model,
        if (_year.text.isNotEmpty) 'vehicleYear': _year.text.trim(),
        if (_plate.text.isNotEmpty) 'licensePlate': _plate.text.trim(),
        if (_customerId != null) 'customer_id': _customerId,
        if (_customerVehicleId != null) 'customer_vehicle_id': _customerVehicleId,
        if (_serviceRequestId != null) 'service_request_id': _serviceRequestId,
      };
      final res = await DioHelper.postData(url: EndPoints.leads, data: body);
      if (!mounted) return;
      if (res.statusCode == 200 || res.statusCode == 201) {
        Navigator.of(context).pushNamedAndRemoveUntil(Routes.leads, (_) => false);
      } else {
        _toast(DioHelper.errorMessage(res) ?? 'Create failed');
      }
    } catch (_) {
      _toast('Failed to create lead');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: AppColors.danger),
    );
  }

  @override
  void dispose() {
    _clientName.dispose();
    _email.dispose();
    _inquiry.dispose();
    _notes.dispose();
    _location.dispose();
    _year.dispose();
    _plate.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: 'Add Lead',
          subtitle: widget.serviceRequestData != null
              ? 'Pre-filled from service request'
              : null,
        ),
        const SizedBox(height: AppSpacing.lg),
        AdminCard(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            children: [
              AdminLabeledField(
                label: 'Inquiry',
                required: true,
                child: TextField(controller: _inquiry, maxLines: 2),
              ),
              AdminDropdown<String>(
                label: 'Source',
                required: true,
                value: _sourceId,
                items: _sources.map((s) => s['_id']?.toString() ?? '').where((s) => s.isNotEmpty).toList(),
                itemLabel: (id) {
                  final s = _sources.firstWhere((x) => x['_id']?.toString() == id, orElse: () => {});
                  return s['mainSourceName']?.toString() ?? id;
                },
                onChanged: (v) => setState(() => _sourceId = v),
              ),
              AdminLabeledField(
                label: 'Client Name',
                required: true,
                child: TextField(controller: _clientName),
              ),
              AdminLabeledField(
                label: 'Phone',
                required: true,
                error: _phoneError,
                child: PhoneInputField(
                  localDigits: _localPhone,
                  countryCode: _countryCode,
                  onLocalChanged: (v) => setState(() => _localPhone = v),
                  onCountryChanged: (c) => setState(() => _countryCode = c),
                ),
              ),
              AdminLabeledField(label: 'Email', child: TextField(controller: _email)),
              AdminLabeledField(label: 'Location', child: TextField(controller: _location)),
              AdminDropdown<String>(
                label: 'Vehicle Make',
                value: _make,
                items: _makes.map((m) => m['makeName']?.toString() ?? '').where((s) => s.isNotEmpty).toList(),
                itemLabel: (v) => v,
                onChanged: (v) => setState(() => _make = v),
              ),
              AdminLabeledField(label: 'Vehicle Model', child: TextField(
                onChanged: (v) => _model = v,
                decoration: InputDecoration(hintText: _model ?? 'Model'),
              )),
              AdminLabeledField(label: 'Notes', child: TextField(controller: _notes, maxLines: 2)),
              const SizedBox(height: 16),
              AdminFormActions(
                onCancel: () => Navigator.of(context).pop(),
                onSave: _save,
                saveLabel: 'Create lead',
                loading: _saving,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
