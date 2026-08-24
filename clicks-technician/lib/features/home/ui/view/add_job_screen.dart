import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/components/vehicle_make_model_fields.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/welcome/logic/services/welcome_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:geolocator/geolocator.dart';

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
  final _vehicleKey = GlobalKey<VehicleMakeModelFieldsState>();

  String _jobType = 'Flat tire';
  bool _saving = false;
  bool _useCatalog = true;
  bool _fetchingLocation = false;

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

  Future<void> _useCurrentLocation() async {
    if (_fetchingLocation) return;
    setState(() => _fetchingLocation = true);
    try {
      final position = await WelcomeService.determinePosition();
      final lat = position.latitude.toStringAsFixed(6);
      final lng = position.longitude.toStringAsFixed(6);
      var label = '$lat, $lng';
      try {
        final res = await DioHelper.getData(
          url: EndPoints.mapsGeocode,
          query: {'latlng': '$lat,$lng', 'region': 'qa'},
        );
        final results = res.data is Map ? res.data['results'] : null;
        if (results is List && results.isNotEmpty) {
          final formatted = results.first['formatted_address']?.toString();
          if (formatted != null && formatted.isNotEmpty) {
            label = '$formatted ($lat, $lng)';
          }
        }
      } catch (_) {}
      _location.text = label;
      if (mounted) {
        AppSnackBars.successSnackBar('Current location added');
      }
    } catch (e) {
      if (!mounted) return;
      final message = e.toString().replaceFirst('Exception: ', '');
      if (message.contains('Location services are disabled')) {
        AppSnackBars.errorSnackBar('Turn on location services to use GPS');
        await Geolocator.openLocationSettings();
      } else if (message.contains('permanently denied')) {
        AppSnackBars.errorSnackBar('Allow location in Settings to use GPS');
        await Geolocator.openAppSettings();
      } else {
        AppSnackBars.errorSnackBar(
          message.isNotEmpty ? message : 'Could not get current location',
        );
      }
    } finally {
      if (mounted) setState(() => _fetchingLocation = false);
    }
  }

  Future<void> _submit() async {
    final phone = _phone.text.replaceAll(RegExp(r'\D'), '');
    final vs = _vehicleKey.currentState;
    final make = _useCatalog && vs != null ? vs.make : _make.text.trim();
    final model = _useCatalog && vs != null ? vs.model : _model.text.trim();

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
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      AppSnackBars.successSnackBar('Job created — you can start now');
      Navigator.pop(context);
    } else {
      AppSnackBars.errorSnackBar(
        widget.cubit.lastActionError ?? 'Failed to create job',
      );
    }
  }

  static const _fieldBorder = Color(0x44FFFFFF);
  static const _fieldFill = Color(0x22FFFFFF);

  InputDecoration _inputDeco(String label) => InputDecoration(
        labelText: label,
        labelStyle: TextStyles.font14RegularGrey.copyWith(color: Colors.white70),
        floatingLabelStyle: const TextStyle(color: Colors.white),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10.r),
          borderSide: const BorderSide(color: _fieldBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10.r),
          borderSide: const BorderSide(color: Colors.white),
        ),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
        filled: true,
        fillColor: _fieldFill,
      );

  Widget _field(String label, TextEditingController c,
      {TextInputType? type, int maxLines = 1}) {
    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: TextField(
        controller: c,
        keyboardType: type,
        maxLines: maxLines,
        style: const TextStyle(color: Colors.white),
        cursorColor: Colors.white,
        decoration: _inputDeco(label),
      ),
    );
  }

  Widget _locationField() {
    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _location,
            maxLines: 2,
            style: const TextStyle(color: Colors.white),
            cursorColor: Colors.white,
            decoration: _inputDeco('Location *').copyWith(
              hintText: 'Address, lat/lng, or Google Maps / Waze link',
              hintStyle: const TextStyle(color: Colors.white38, fontSize: 13),
              suffixIcon: IconButton(
                tooltip: 'Use current location',
                onPressed:
                    _fetchingLocation || _saving ? null : _useCurrentLocation,
                icon: _fetchingLocation
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.my_location, color: Colors.white),
              ),
            ),
          ),
          SizedBox(height: 8.h),
          OutlinedButton.icon(
            onPressed: _fetchingLocation || _saving ? null : _useCurrentLocation,
            icon: _fetchingLocation
                ? SizedBox(
                    width: 18.w,
                    height: 18.w,
                    child: const CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Icon(Icons.my_location, size: 18.sp, color: Colors.white),
            label: Text(
              _fetchingLocation ? 'Getting location…' : 'Use current location',
              style: TextStyles.font14RegularGrey.copyWith(color: Colors.white),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: _fieldBorder),
              backgroundColor: _fieldFill,
              padding: EdgeInsets.symmetric(vertical: 12.h, horizontal: 12.w),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10.r),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF320A0A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF320A0A),
        foregroundColor: Colors.white,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          'Add job',
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
      ),
      body: ListView(
        padding: EdgeInsets.all(16.w),
        children: [
          _field('Customer name *', _name),
          _field('Phone (8 digits) *', _phone, type: TextInputType.phone),
          VehicleMakeModelFields(
            key: _vehicleKey,
            onCatalogReady: (ok) => setState(() => _useCatalog = ok),
            lightOnDark: true,
          ),
          if (!_useCatalog)
            VehicleMakeModelTextFields(
              makeController: _make,
              modelController: _model,
              lightOnDark: true,
            ),
          _field('Year', _year, type: TextInputType.number),
          _field('Plate', _plate),
          _field('VIN', _vin),
          _locationField(),
          _field('Issue *', _issue, maxLines: 3),
          _field('Price *', _price, type: TextInputType.number),
          DropdownButtonFormField<String>(
            value: _jobType,
            dropdownColor: const Color(0xFF5C1515),
            style: const TextStyle(color: Colors.white),
            decoration: _inputDeco('Job type'),
            items: const [
              DropdownMenuItem(value: 'Towing', child: Text('Towing')),
              DropdownMenuItem(
                value: 'Jump start',
                child: Text('Jump start / Battery boost'),
              ),
              DropdownMenuItem(
                value: 'Flat tire',
                child: Text('Flat tire / Tire change'),
              ),
              DropdownMenuItem(
                value: 'Lockout',
                child: Text('Lockout / Key locked in car'),
              ),
              DropdownMenuItem(
                value: 'Fuel delivery',
                child: Text('Fuel delivery'),
              ),
              DropdownMenuItem(
                value: 'Battery replacement',
                child: Text('Battery replacement'),
              ),
              DropdownMenuItem(
                value: 'Accident assistance',
                child: Text('Accident assistance'),
              ),
            ],
            onChanged: (v) => setState(() => _jobType = v ?? 'Flat tire'),
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
