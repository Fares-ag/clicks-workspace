import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_card.dart';
import '../../core/components/admin_detail_header.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/components/admin_page_scaffold.dart';
import '../../core/constants/job_types.dart';
import '../../core/forms/form_fields.dart';
import '../../core/helper/phone_utils.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// Full job create form — mirrors AddNewJob.jsx.
class NewJobScreen extends StatefulWidget {
  const NewJobScreen({super.key, this.sosData, this.serviceRequestData});

  final Map<String, dynamic>? sosData;
  final Map<String, dynamic>? serviceRequestData;

  @override
  State<NewJobScreen> createState() => _NewJobScreenState();
}

class _NewJobScreenState extends State<NewJobScreen> {
  final _clientName = TextEditingController();
  final _email = TextEditingController();
  final _issue = TextEditingController();
  final _location = TextEditingController();
  final _year = TextEditingController();
  final _plate = TextEditingController();
  final _vin = TextEditingController();
  final _price = TextEditingController();
  final _subSource = TextEditingController();

  String _countryCode = defaultCountryCode;
  String _localPhone = '';
  String? _phoneError;
  String? _make;
  String? _model;
  String? _jobType;
  String? _sourceId;
  String? _technicianId;
  DateTime? _dateTime;
  bool _saving = false;
  bool _loadingMeta = true;

  List<Map<String, dynamic>> _sources = [];
  List<Map<String, dynamic>> _technicians = [];
  List<Map<String, dynamic>> _makes = [];
  List<Map<String, dynamic>> _models = [];

  String? _customerId;
  String? _customerVehicleId;
  String? _sosId;
  String? _serviceRequestId;
  bool get _lockedClient => widget.sosData != null;

  @override
  void initState() {
    super.initState();
    _loadMeta().then((_) {
      _prefill();
    });
  }

  Future<void> _loadMeta() async {
    try {
      final results = await Future.wait([
        DioHelper.getData(url: EndPoints.sources),
        DioHelper.getData(url: '${EndPoints.technicians}?limit=100'),
        DioHelper.getData(url: EndPoints.vehicleMakes),
      ]);
      if (!mounted) return;
      setState(() {
        _sources = _listFrom(results[0].data, 'sources');
        _technicians = _listFrom(results[1].data, 'technicians');
        _makes = _listFrom(results[2].data, 'makes');
        _loadingMeta = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMeta = false);
    }
  }

  List<Map<String, dynamic>> _listFrom(dynamic data, String key) {
    if (data is! Map) return [];
    final list = data[key];
    if (list is! List) return [];
    return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  void _prefill() {
    final sos = widget.sosData;
    final sr = widget.serviceRequestData;
    if (sos != null) {
      final customer = sos['customer'];
      if (customer is Map) {
        _clientName.text =
            customer['name']?.toString() ??
            '${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}'.trim();
        _localPhone = toLocalDigits(
          customer['phone']?.toString() ?? customer['phone_number']?.toString() ?? '',
          _countryCode,
        );
      }
      _customerId = sos['customer_id']?.toString();
      _customerVehicleId = sos['customer_vehicle_id']?.toString();
      _sosId = sos['sos_id']?.toString() ?? sos['_id']?.toString() ?? sos['id']?.toString();
      final loc = sos['location'];
      if (loc is Map) {
        final coords = loc['coordinates'];
        if (coords is List && coords.length >= 2) {
          _location.text = '${coords[1]}, ${coords[0]}';
        } else if (loc['latitude'] != null && loc['longitude'] != null) {
          _location.text = '${loc['latitude']}, ${loc['longitude']}';
        }
      }
      if (sos['skip_vehicle'] == true) {
        _issue.text = 'SOS — vehicle not provided by customer';
      }
      _sourceId = _findSourceId('sos');
    }

    if (sr != null) {
      final customer = sr['customer'];
      if (customer is Map) {
        _clientName.text = customer['name']?.toString() ?? _clientName.text;
        _localPhone = toLocalDigits(customer['phone']?.toString() ?? '', _countryCode);
      }
      _customerId = sr['customer_id']?.toString();
      _customerVehicleId = sr['customer_vehicle_id']?.toString();
      _serviceRequestId =
          sr['service_request_id']?.toString() ?? sr['_id']?.toString() ?? sr['id']?.toString();
      final vehicle = sr['vehicle'];
      if (vehicle is Map) {
        _make = _cleanVehicleField(vehicle['make']?.toString());
        _model = _cleanVehicleField(vehicle['model']?.toString());
        _year.text = _cleanVehicleField(vehicle['year']?.toString()) ?? '';
        _plate.text = _cleanVehicleField(vehicle['plate']?.toString()) ?? '';
      }
      _issue.text = sr['service_type']?.toString() ?? _issue.text;
      final loc = sr['location'];
      if (loc is Map) {
        final coords = loc['coordinates'];
        if (coords is List && coords.length >= 2) {
          _location.text = '${coords[1]}, ${coords[0]}';
        }
      }
      if (sr['timing'] == 'scheduled' && sr['scheduled_for'] != null) {
        _dateTime = DateTime.tryParse(sr['scheduled_for'].toString());
      }
      _sourceId = _findSourceId('app') ?? _findSourceId('mobile');
    }
    setState(() {});
  }

  String? _cleanVehicleField(String? v) {
    if (v == null || v.isEmpty || v == 'Unknown') return null;
    return v;
  }

  String? _findSourceId(String name) {
    final lower = name.toLowerCase();
    for (final s in _sources) {
      if (s['mainSourceName']?.toString().toLowerCase() == lower) {
        return s['_id']?.toString();
      }
    }
    return _sources.isNotEmpty ? _sources.first['_id']?.toString() : null;
  }

  Future<void> _loadModels(String? makeName) async {
    if (makeName == null) return;
    final make = _makes.firstWhere(
      (m) => m['makeName'] == makeName || m['_id'] == makeName,
      orElse: () => {},
    );
    final makeId = make['_id']?.toString();
    if (makeId == null) return;
    final res = await DioHelper.getData(url: '${EndPoints.vehicleModels}/make/$makeId');
    if (!mounted) return;
    setState(() {
      _models = _listFrom(res.data, 'models');
    });
  }

  List<Map<String, dynamic>> get _availableTechnicians {
    return _technicians.where((tech) {
      final approved = tech['applicationStatus'] == 'Approved';
      final status = tech['currentStatus']?.toString() ?? '';
      final available = status == 'Online' || status == 'On Job';
      if (_jobType == null || _jobType!.isEmpty) {
        return approved && available;
      }
      final expertise = (tech['expertise'] as List?) ?? [];
      return approved && available && matchesJobTypeExpertise(_jobType!, expertise);
    }).toList();
  }

  Future<void> _save() async {
    if (_issue.text.trim().isEmpty) {
      _showError('Issue description is mandatory');
      return;
    }
    if (!isValidLocalPhone(_localPhone, _countryCode)) {
      setState(() {
        _phoneError = 'Enter a valid ${localLengthHint(_countryCode)} local number';
      });
      return;
    }
    if (_location.text.trim().isEmpty ||
        _dateTime == null ||
        (_jobType == null || _jobType!.isEmpty) ||
        _price.text.trim().isEmpty ||
        (_sourceId == null || _sourceId!.isEmpty) ||
        (_make == null || _make!.isEmpty) ||
        (_model == null || _model!.isEmpty)) {
      _showError('Please complete all required fields');
      return;
    }

    setState(() => _saving = true);
    try {
      final body = <String, dynamic>{
        if (_customerId != null) 'customer_id': _customerId,
        if (_customerVehicleId != null) 'customer_vehicle_id': _customerVehicleId,
        'clientName': _clientName.text.trim(),
        'clientMobileNumber': toE164(_localPhone, _countryCode),
        'clientEmail': _email.text.trim(),
        'vehicleMake': _make,
        'vehicleModel': _model,
        if (_year.text.trim().isNotEmpty) 'vehicleYear': int.tryParse(_year.text.trim()),
        'licensePlate': _plate.text.trim(),
        'vinNumber': _vin.text.trim(),
        'issue': _issue.text.trim(),
        'location': _location.text.trim(),
        'dateTime': _dateTime!.toUtc().toIso8601String(),
        'jobType': _jobType,
        if (_technicianId != null && _technicianId!.isNotEmpty)
          'assignedTechnician': _technicianId,
        'price': _price.text.trim(),
        'source': _sourceId,
        'subSource': _subSource.text.trim(),
      };
      if (_sosId != null && _sosId!.isNotEmpty) {
        body['sos_request_id'] = _sosId;
      }
      if (_serviceRequestId != null && _serviceRequestId!.isNotEmpty) {
        body['service_request_id'] = _serviceRequestId;
      }

      final res = await DioHelper.postData(url: EndPoints.jobs, data: body);
      if (!mounted) return;
      if (res.statusCode == 200 || res.statusCode == 201) {
        Navigator.of(context).pushNamedAndRemoveUntil(Routes.jobs, (_) => false);
      } else {
        _showError(DioHelper.errorMessage(res) ?? 'Create failed');
      }
    } catch (_) {
      _showError('Failed to create job');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: AppColors.danger),
    );
  }

  @override
  void dispose() {
    _clientName.dispose();
    _email.dispose();
    _issue.dispose();
    _location.dispose();
    _year.dispose();
    _plate.dispose();
    _vin.dispose();
    _price.dispose();
    _subSource.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingMeta) {
      return const AdminLoadingState(message: 'Loading form…');
    }

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: widget.sosData != null ? 'Create Job from SOS' : 'Add New Job',
          subtitle: widget.sosData != null ? 'Client details are pre-filled from the SOS request' : null,
        ),
        const SizedBox(height: AppSpacing.lg),
        AdminCard(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AdminFormSection(
                title: 'Client Details',
                children: [
                  AdminLabeledField(
                    label: 'Client Name',
                    required: true,
                    child: TextField(
                      controller: _clientName,
                      enabled: !_lockedClient,
                    ),
                  ),
                  AdminLabeledField(
                    label: 'Client Phone Number',
                    required: true,
                    error: _phoneError,
                    child: PhoneInputField(
                      localDigits: _localPhone,
                      countryCode: _countryCode,
                      enabled: !_lockedClient,
                      onLocalChanged: (v) {
                        setState(() {
                          _localPhone = v;
                          _phoneError = v.isNotEmpty && !isValidLocalPhone(v, _countryCode)
                              ? 'Enter a valid ${localLengthHint(_countryCode)} number'
                              : null;
                        });
                      },
                      onCountryChanged: (c) => setState(() => _countryCode = c),
                    ),
                  ),
                  AdminLabeledField(
                    label: 'Client Email Address',
                    child: TextField(
                      controller: _email,
                      enabled: !_lockedClient,
                      keyboardType: TextInputType.emailAddress,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              AdminFormSection(
                title: 'Vehicle Details',
                children: [
                  AdminDropdown<String>(
                    label: 'Make',
                    required: true,
                    value: _make,
                    items: _makes.map((m) => m['makeName']?.toString() ?? '').where((s) => s.isNotEmpty).toList(),
                    itemLabel: (v) => v,
                    onChanged: (v) async {
                      setState(() {
                        _make = v;
                        _model = null;
                        _models = [];
                      });
                      await _loadModels(v);
                    },
                  ),
                  AdminDropdown<String>(
                    label: 'Model',
                    required: true,
                    value: _model,
                    items: [
                      ..._models.map((m) => m['modelName']?.toString() ?? '').where((s) => s.isNotEmpty),
                      'Other',
                    ],
                    itemLabel: (v) => v,
                    onChanged: (v) => setState(() => _model = v),
                  ),
                  AdminLabeledField(
                    label: 'Year',
                    child: TextField(controller: _year, keyboardType: TextInputType.number),
                  ),
                  AdminLabeledField(label: 'License Plate', child: TextField(controller: _plate)),
                  AdminLabeledField(label: 'VIN', child: TextField(controller: _vin)),
                ],
              ),
              const SizedBox(height: 16),
              AdminFormSection(
                title: 'Job Details',
                children: [
                  AdminLabeledField(
                    label: 'Location',
                    required: true,
                    child: TextField(
                      controller: _location,
                      decoration: const InputDecoration(
                        hintText: 'Address, lat/lng, or maps link',
                      ),
                    ),
                  ),
                  AdminLabeledField(
                    label: 'Date & Time',
                    required: true,
                    child: DateTimePickerField(
                      value: _dateTime,
                      onChanged: (dt) => setState(() => _dateTime = dt),
                    ),
                  ),
                  AdminDropdown<String>(
                    label: 'Job Type',
                    required: true,
                    value: _jobType,
                    items: kJobTypes.map((j) => j.value).toList(),
                    itemLabel: jobTypeLabel,
                    onChanged: (v) => setState(() {
                      _jobType = v;
                      _technicianId = null;
                    }),
                  ),
                  AdminLabeledField(
                    label: 'Price',
                    required: true,
                    child: TextField(controller: _price, keyboardType: TextInputType.number),
                  ),
                  AdminLabeledField(
                    label: 'Issue',
                    required: true,
                    child: TextField(controller: _issue, maxLines: 3),
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
                  AdminLabeledField(label: 'Sub Source', child: TextField(controller: _subSource)),
                ],
              ),
              const SizedBox(height: 16),
              AdminFormSection(
                title: 'Dispatch',
                children: [
                  AdminDropdown<String>(
                    label: 'Assigned Technician',
                    value: _technicianId,
                    items: [
                      '',
                      ..._availableTechnicians.map((t) => t['_id']?.toString() ?? ''),
                    ].where((s) => s.isNotEmpty).toList(),
                    itemLabel: (id) {
                      final t = _availableTechnicians.firstWhere(
                        (x) => x['_id']?.toString() == id,
                        orElse: () => {},
                      );
                      if (t.isEmpty) return 'Unassigned';
                      return '${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'.trim();
                    },
                    onChanged: (v) => setState(() => _technicianId = v),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              AdminFormActions(
                onCancel: () => Navigator.of(context).pop(),
                onSave: _save,
                saveLabel: widget.sosData != null ? 'Create from SOS' : 'Create job',
                loading: _saving,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
