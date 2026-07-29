import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class AddSubscriptionScreen extends StatefulWidget {
  const AddSubscriptionScreen({super.key, required this.cubit});
  final HomeCubit cubit;

  @override
  State<AddSubscriptionScreen> createState() => _AddSubscriptionScreenState();
}

class _AddSubscriptionScreenState extends State<AddSubscriptionScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _plate = TextEditingController();
  final _plan = TextEditingController(text: 'Roadside Monthly');
  final _months = TextEditingController(text: '12');
  final _price = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _plate.dispose();
    _plan.dispose();
    _months.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty ||
        _phone.text.trim().isEmpty ||
        _plate.text.trim().isEmpty ||
        _plan.text.trim().isEmpty ||
        _months.text.trim().isEmpty ||
        _price.text.trim().isEmpty) {
      AppSnackBars.errorSnackBar('Fill all required fields');
      return;
    }
    setState(() => _saving = true);
    final ok = await widget.cubit.createSubscription({
      'clientName': _name.text.trim(),
      'phone': _phone.text.trim(),
      'plateNumber': _plate.text.trim(),
      'planName': _plan.text.trim(),
      'durationMonths': int.tryParse(_months.text.trim()) ?? 12,
      'price': double.tryParse(_price.text.trim()) ?? 0,
      'startDate': DateTime.now().toIso8601String(),
    });
    setState(() => _saving = false);
    if (!mounted) return;
    if (ok) {
      AppSnackBars.successSnackBar('Subscription created');
      Navigator.pop(context);
    } else {
      AppSnackBars.errorSnackBar('Failed to create subscription');
    }
  }

  Widget _field(String label, TextEditingController c,
      {TextInputType? type}) {
    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: TextField(
        controller: c,
        keyboardType: type,
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Add subscription',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.bold)),
      ),
      body: ListView(
        padding: EdgeInsets.all(16.w),
        children: [
          _field('Customer name *', _name),
          _field('Phone *', _phone, type: TextInputType.phone),
          _field('Plate *', _plate),
          _field('Plan name *', _plan),
          _field('Duration (months) *', _months, type: TextInputType.number),
          _field('Price *', _price, type: TextInputType.number),
          SizedBox(height: 12.h),
          AppButton(
            isLoading: _saving,
            onPressed: _saving ? null : _submit,
            label: 'Sell subscription',
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
