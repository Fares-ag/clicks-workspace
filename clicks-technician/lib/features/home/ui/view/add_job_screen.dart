import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class AddJobScreen extends StatefulWidget {
  const AddJobScreen({super.key, required this.cubit});
  final HomeCubit cubit;

  @override
  State<AddJobScreen> createState() => _AddJobScreenState();
}

class _AddJobScreenState extends State<AddJobScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _year = TextEditingController();
  final _plate = TextEditingController();
  final _vin = TextEditingController();
  final _issue = TextEditingController();
  final _location = TextEditingController();
  final _price = TextEditingController();
  String _jobType = 'Tires';
  bool _saving = false;
  bool _loadingCatalog = true;

  List<Map<String, dynamic>> _makes = [];
  List<Map<String, dynamic>> _models = [];
  String? _selectedMakeName;
  String? _selectedModelName;
  bool _modelIsOther = false;

  @override
  void initState() {
    super.initState();
    _loadMakes();
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _phone,
      _make,
      _model,
      _year,
      _plate,
      _vin,
      _issue,
      _location,
      _price,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _useCatalog => _makes.isNotEmpty;

  Future<void> _loadMakes() async {
    try {
      final res = await DioHelper.getData(url: EndPoints.vehicleMakes, auth: false);
      if (res.statusCode == 200 && res.data is Map) {
        final raw = res.data['makes'];
        if (raw is List) {
          _makes = raw
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          _makes.sort(
            (a, b) => (a['makeName']?.toString() ?? '')
                .compareTo(b['makeName']?.toString() ?? ''),
          );
        }
      }
    } catch (_) {
      _makes = [];
    }
    if (mounted) setState(() => _loadingCatalog = false);
  }

  Future<void> _onMakeChanged(String? makeName) async {
    setState(() {
      _selectedMakeName = makeName;
      _selectedModelName = null;
      _modelIsOther = false;
      _model.clear();
      _models = [];
    });
    if (makeName == null || makeName.isEmpty) return;

    String makeId = '';
    for (final m in _makes) {
      if (m['makeName']?.toString() == makeName) {
        makeId = m['_id']?.toString() ?? '';
        break;
      }
    }
    if (makeId.isEmpty) return;

    try {
      final res = await DioHelper.getData(
        url: EndPoints.vehicleModels(makeId),
        auth: false,
      );
      if (res.statusCode == 200 && res.data is Map) {
        final raw = res.data['models'];
        if (raw is List) {
          _models = raw
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          _models.sort(
            (a, b) => (a['modelName']?.toString() ?? '')
                .compareTo(b['modelName']?.toString() ?? ''),
          );
        }
      }
    } catch (_) {
      _models = [];
    }
    if (mounted) setState(() {});
  }

  Future<void> _submit() async {
    final phone = _phone.text.replaceAll(RegExp(r'\D'), '');
    final make = _useCatalog
        ? (_selectedMakeName ?? '').trim()
        : _make.text.trim();
    final model = _useCatalog
        ? (_modelIsOther
            ? _model.text.trim()
            : (_selectedModelName ?? '').trim())
        : _model.text.trim();

    if (_name.text.trim().isEmpty ||
        phone.length != 8 ||
        make.isEmpty ||
        model.isEmpty ||
        _issue.text.trim().isEmpty ||
        _location.text.trim().isEmpty ||
        _price.text.trim().isEmpty) {
      AppSnackBars.errorSnackBar('Fill required fields (phone = 8 digits)');
      return;
    }
    setState(() => _saving = true);
    final ok = await widget.cubit.createJobCard({
      'clientName': _name.text.trim(),
      'clientMobileNumber': phone,
      'countryCode': '+974',
      'vehicleMake': make,
      'vehicleModel': model,
      if (_year.text.trim().isNotEmpty) 'vehicleYear': int.tryParse(_year.text),
      'licensePlate': _plate.text.trim(),
      'vinNumber': _vin.text.trim(),
      'issue': _issue.text.trim(),
      'location': _location.text.trim(),
      'dateTime': DateTime.now().toIso8601String(),
      'jobType': _jobType,
      'price': double.tryParse(_price.text.trim()) ?? 0,
    });
    setState(() => _saving = false);
    if (!mounted) return;
    if (ok) {
      AppSnackBars.successSnackBar('Job submitted to admin');
      Navigator.pop(context);
    } else {
      AppSnackBars.errorSnackBar('Failed to create job');
    }
  }

  Widget _field(String label, TextEditingController c,
      {TextInputType? type, int maxLines = 1}) {
    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: TextField(
        controller: c,
        keyboardType: type,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
        ),
      ),
    );
  }

  Widget _dropdown({
    required String label,
    required String? value,
    required List<String> items,
    required ValueChanged<String?> onChanged,
    bool enabled = true,
  }) {
    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: DropdownButtonFormField<String>(
        value: value != null && items.contains(value) ? value : null,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
        ),
        items: items
            .map((e) => DropdownMenuItem(value: e, child: Text(e)))
            .toList(),
        onChanged: enabled ? onChanged : null,
      ),
    );
  }

  List<String> get _makeNames => _makes
      .map((m) => m['makeName']?.toString() ?? '')
      .where((n) => n.isNotEmpty)
      .toList();

  List<String> get _modelNames {
    final names = _models
        .map((m) => m['modelName']?.toString() ?? '')
        .where((n) => n.isNotEmpty)
        .toList();
    if (!names.contains('Other')) names.add('Other');
    return names;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Add job',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.bold)),
      ),
      body: ListView(
        padding: EdgeInsets.all(16.w),
        children: [
          _field('Customer name *', _name),
          _field('Phone (8 digits) *', _phone, type: TextInputType.phone),
          if (_loadingCatalog)
            Padding(
              padding: EdgeInsets.only(bottom: 12.h),
              child: const LinearProgressIndicator(minHeight: 2),
            )
          else if (_useCatalog) ...[
            _dropdown(
              label: 'Make *',
              value: _selectedMakeName,
              items: _makeNames,
              onChanged: (v) => _onMakeChanged(v),
            ),
            _dropdown(
              label: 'Model *',
              value: _selectedModelName,
              items: _modelNames,
              enabled: _selectedMakeName != null,
              onChanged: (v) {
                setState(() {
                  _selectedModelName = v;
                  _modelIsOther = v == 'Other';
                  if (!_modelIsOther) _model.clear();
                });
              },
            ),
            if (_modelIsOther) _field('Specify model *', _model),
          ] else ...[
            _field('Make *', _make),
            _field('Model *', _model),
          ],
          _field('Year', _year, type: TextInputType.number),
          _field('Plate', _plate),
          _field('VIN', _vin),
          _field('Location *', _location),
          _field('Issue *', _issue, maxLines: 3),
          _field('Price *', _price, type: TextInputType.number),
          DropdownButtonFormField<String>(
            value: _jobType,
            decoration: InputDecoration(
              labelText: 'Job type',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
            ),
            items: const ['Tires', 'Engines', 'Gearbox']
                .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                .toList(),
            onChanged: (v) => setState(() => _jobType = v ?? 'Tires'),
          ),
          SizedBox(height: 20.h),
          AppButton(
            isLoading: _saving,
            onPressed: _saving ? null : _submit,
            label: 'Create job',
            margin: 0,
            bgColor: ColorsManager.mainColor,
            textColor: Colors.white,
            height: 48.h,
            radius: 10.r,
          ),
        ],
      ),
    );
  }
}
