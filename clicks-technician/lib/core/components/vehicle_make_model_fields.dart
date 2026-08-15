import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Make / model pickers backed by `/api/vehicles/makes` and `/api/vehicles/models`.
class VehicleMakeModelFields extends StatefulWidget {
  const VehicleMakeModelFields({
    super.key,
    this.initialMake,
    this.initialModel,
    this.onChanged,
    this.onCatalogReady,
    this.lightOnDark = false,
  });

  final String? initialMake;
  final String? initialModel;
  final void Function(String make, String model)? onChanged;
  final void Function(bool catalogAvailable)? onCatalogReady;
  final bool lightOnDark;

  @override
  State<VehicleMakeModelFields> createState() => VehicleMakeModelFieldsState();
}

class VehicleMakeModelFieldsState extends State<VehicleMakeModelFields> {
  final _otherModelCtrl = TextEditingController();
  final _makeCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _makeFocus = FocusNode();
  final _modelFocus = FocusNode();

  List<Map<String, dynamic>> _makes = [];
  List<Map<String, dynamic>> _models = [];
  String? _selectedMake;
  String? _selectedModel;
  bool _modelIsOther = false;
  bool _loadingMakes = true;
  bool _loadingModels = false;

  bool get useCatalog => _makes.isNotEmpty;

  String get make => useCatalog ? (_selectedMake ?? '').trim() : '';

  String get model {
    if (!useCatalog) return '';
    if (_modelIsOther) return _otherModelCtrl.text.trim();
    return (_selectedModel ?? '').trim();
  }

  @override
  void initState() {
    super.initState();
    _selectedMake = _emptyToNull(widget.initialMake);
    _selectedModel = _emptyToNull(widget.initialModel);
    if (_selectedMake != null) _makeCtrl.text = _selectedMake!;
    if (_selectedModel != null) _modelCtrl.text = _selectedModel!;
    _loadMakes();
  }

  @override
  void dispose() {
    _otherModelCtrl.dispose();
    _makeCtrl.dispose();
    _modelCtrl.dispose();
    _makeFocus.dispose();
    _modelFocus.dispose();
    super.dispose();
  }

  String? _emptyToNull(String? v) {
    final t = v?.trim() ?? '';
    return t.isEmpty ? null : t;
  }

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

    if (!mounted) return;
    setState(() => _loadingMakes = false);
    widget.onCatalogReady?.call(_makes.isNotEmpty);

    final makeNames = _makeNames;
    if (_selectedMake != null && !makeNames.contains(_selectedMake)) {
      _selectedMake = null;
      _selectedModel = null;
      _makeCtrl.clear();
      _modelCtrl.clear();
    } else if (_selectedMake != null) {
      _makeCtrl.text = _selectedMake!;
    }

    if (_selectedMake != null) {
      await _loadModelsForMake(_selectedMake!, preserveModel: widget.initialModel);
    }
  }

  Future<void> _loadModelsForMake(String makeName, {String? preserveModel}) async {
    setState(() => _loadingModels = true);

    String makeId = '';
    for (final m in _makes) {
      if (m['makeName']?.toString() == makeName) {
        makeId = m['_id']?.toString() ?? '';
        break;
      }
    }

    _models = [];
    if (makeId.isNotEmpty) {
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
    }

    final modelNames = _modelNames;
    final initial = _emptyToNull(preserveModel);
    if (initial != null) {
      if (modelNames.contains(initial)) {
        _selectedModel = initial;
        _modelIsOther = false;
        _modelCtrl.text = initial;
      } else {
        _selectedModel = 'Other';
        _modelIsOther = true;
        _modelCtrl.text = 'Other';
        _otherModelCtrl.text = initial;
      }
    }

    if (mounted) {
      setState(() => _loadingModels = false);
      _notifyChanged();
    }
  }

  void _notifyChanged() {
    widget.onChanged?.call(make, model);
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

  InputDecoration _fieldDeco(
    String label, {
    bool enabled = true,
    FocusNode? focusNode,
  }) {
    final borderColor = widget.lightOnDark ? const Color(0x44FFFFFF) : null;
    final fillColor = widget.lightOnDark ? const Color(0x22FFFFFF) : null;
    final textColor = widget.lightOnDark ? Colors.white : null;
    final labelColor = widget.lightOnDark ? Colors.white70 : null;
    return InputDecoration(
      labelText: label,
      hintText: enabled ? 'Type to search or scroll' : 'Select a make first',
      hintStyle: widget.lightOnDark
          ? const TextStyle(color: Colors.white38, fontSize: 13)
          : const TextStyle(fontSize: 13, color: Colors.black38),
      suffixIcon: IconButton(
        tooltip: 'Show all',
        icon: Icon(
          Icons.arrow_drop_down,
          color: widget.lightOnDark ? Colors.white70 : null,
        ),
        onPressed: enabled && focusNode != null
            ? () {
                if (focusNode.hasFocus) {
                  focusNode.unfocus();
                }
                focusNode.requestFocus();
              }
            : null,
      ),
      labelStyle: labelColor != null ? TextStyle(color: labelColor) : null,
      floatingLabelStyle:
          textColor != null ? TextStyle(color: textColor) : null,
      filled: widget.lightOnDark,
      fillColor: fillColor,
      enabledBorder: borderColor != null
          ? OutlineInputBorder(
              borderRadius: BorderRadius.circular(10.r),
              borderSide: BorderSide(color: borderColor),
            )
          : OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
      focusedBorder: borderColor != null
          ? OutlineInputBorder(
              borderRadius: BorderRadius.circular(10.r),
              borderSide: const BorderSide(color: Colors.white),
            )
          : OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
    );
  }

  Iterable<String> _filterItems(List<String> items, String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return items;
    final starts = items.where((e) => e.toLowerCase().startsWith(q));
    final contains = items.where(
      (e) => !e.toLowerCase().startsWith(q) && e.toLowerCase().contains(q),
    );
    return [...starts, ...contains];
  }

  String? _bestMatch(List<String> items, String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return null;
    for (final e in items) {
      if (e.toLowerCase() == q) return e;
    }
    final starts = items.where((e) => e.toLowerCase().startsWith(q)).toList();
    if (starts.length == 1) return starts.first;
    return null;
  }

  Widget _searchable({
    required String label,
    required TextEditingController controller,
    required FocusNode focusNode,
    required List<String> items,
    required ValueChanged<String> onSelected,
    bool enabled = true,
  }) {
    final textColor = widget.lightOnDark ? Colors.white : null;
    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: RawAutocomplete<String>(
        textEditingController: controller,
        focusNode: focusNode,
        optionsBuilder: (value) {
          if (!enabled) return const Iterable<String>.empty();
          return _filterItems(items, value.text);
        },
        onSelected: onSelected,
        displayStringForOption: (v) => v,
        fieldViewBuilder: (context, textController, fieldFocus, onFieldSubmitted) {
          return TextField(
            controller: textController,
            focusNode: fieldFocus,
            enabled: enabled,
            style: textColor != null ? TextStyle(color: textColor) : null,
            cursorColor: widget.lightOnDark ? Colors.white : null,
            decoration: _fieldDeco(
              label,
              enabled: enabled,
              focusNode: fieldFocus,
            ),
            onSubmitted: (value) {
              final match = _bestMatch(items, value);
              if (match != null) {
                onSelected(match);
                onFieldSubmitted();
              }
            },
            onEditingComplete: () {
              final match = _bestMatch(items, textController.text);
              if (match != null) onSelected(match);
            },
          );
        },
        optionsViewBuilder: (context, onOptionSelected, options) {
          final list = options.toList();
          return Align(
            alignment: Alignment.topLeft,
            child: Material(
              elevation: 6,
              color: widget.lightOnDark ? const Color(0xFF5C1515) : Colors.white,
              borderRadius: BorderRadius.circular(10.r),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: 240.h, minWidth: 280.w),
                child: list.isEmpty
                    ? Padding(
                        padding: EdgeInsets.all(14.w),
                        child: Text(
                          'No matches',
                          style: TextStyle(
                            color: widget.lightOnDark
                                ? Colors.white70
                                : Colors.black54,
                          ),
                        ),
                      )
                    : ListView.builder(
                        padding: EdgeInsets.zero,
                        shrinkWrap: true,
                        itemCount: list.length,
                        itemBuilder: (context, index) {
                          final option = list[index];
                          return ListTile(
                            dense: true,
                            title: Text(
                              option,
                              style: TextStyle(
                                color: widget.lightOnDark ? Colors.white : null,
                              ),
                            ),
                            onTap: () => onOptionSelected(option),
                          );
                        },
                      ),
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingMakes) {
      return Padding(
        padding: EdgeInsets.only(bottom: 12.h),
        child: const LinearProgressIndicator(minHeight: 2),
      );
    }

    if (!useCatalog) {
      return Padding(
        padding: EdgeInsets.only(bottom: 8.h),
        child: Text(
          'Vehicle catalog unavailable — enter make and model manually.',
          style: TextStyles.font12RegularGrey.copyWith(
            color: widget.lightOnDark ? Colors.white70 : null,
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _searchable(
          label: 'Make *',
          controller: _makeCtrl,
          focusNode: _makeFocus,
          items: _makeNames,
          onSelected: (v) async {
            setState(() {
              _selectedMake = v;
              _makeCtrl.text = v;
              _selectedModel = null;
              _modelCtrl.clear();
              _modelIsOther = false;
              _otherModelCtrl.clear();
            });
            await _loadModelsForMake(v);
            _notifyChanged();
          },
        ),
        if (_loadingModels)
          Padding(
            padding: EdgeInsets.only(bottom: 12.h),
            child: const LinearProgressIndicator(minHeight: 2),
          )
        else
          _searchable(
            label: 'Model *',
            controller: _modelCtrl,
            focusNode: _modelFocus,
            items: _modelNames,
            enabled: _selectedMake != null,
            onSelected: (v) {
              setState(() {
                _selectedModel = v;
                _modelCtrl.text = v;
                _modelIsOther = v == 'Other';
                if (!_modelIsOther) _otherModelCtrl.clear();
              });
              _notifyChanged();
            },
          ),
        if (_modelIsOther)
          Padding(
            padding: EdgeInsets.only(bottom: 12.h),
            child: TextField(
              controller: _otherModelCtrl,
              style: widget.lightOnDark
                  ? const TextStyle(color: Colors.white)
                  : null,
              cursorColor: widget.lightOnDark ? Colors.white : null,
              decoration: InputDecoration(
                labelText: 'Specify model *',
                labelStyle: widget.lightOnDark
                    ? const TextStyle(color: Colors.white70)
                    : null,
                floatingLabelStyle: widget.lightOnDark
                    ? const TextStyle(color: Colors.white)
                    : null,
                filled: widget.lightOnDark,
                fillColor: widget.lightOnDark
                    ? const Color(0x22FFFFFF)
                    : null,
                enabledBorder: widget.lightOnDark
                    ? OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10.r),
                        borderSide: const BorderSide(color: Color(0x44FFFFFF)),
                      )
                    : OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10.r),
                      ),
                focusedBorder: widget.lightOnDark
                    ? OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10.r),
                        borderSide: const BorderSide(color: Colors.white),
                      )
                    : OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10.r),
                      ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10.r),
                ),
              ),
              onChanged: (_) => _notifyChanged(),
            ),
          ),
      ],
    );
  }
}

/// Fallback text fields when catalog API is unavailable.
class VehicleMakeModelTextFields extends StatelessWidget {
  const VehicleMakeModelTextFields({
    super.key,
    required this.makeController,
    required this.modelController,
    this.lightOnDark = false,
  });

  final TextEditingController makeController;
  final TextEditingController modelController;
  final bool lightOnDark;

  @override
  Widget build(BuildContext context) {
    InputDecoration deco(String label) => InputDecoration(
          labelText: label,
          labelStyle: lightOnDark
              ? const TextStyle(color: Colors.white70)
              : null,
          floatingLabelStyle:
              lightOnDark ? const TextStyle(color: Colors.white) : null,
          filled: lightOnDark,
          fillColor: lightOnDark ? const Color(0x22FFFFFF) : null,
          enabledBorder: lightOnDark
              ? OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10.r),
                  borderSide: const BorderSide(color: Color(0x44FFFFFF)),
                )
              : OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
          focusedBorder: lightOnDark
              ? OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10.r),
                  borderSide: const BorderSide(color: Colors.white),
                )
              : OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10.r)),
        );

    final fieldStyle =
        lightOnDark ? const TextStyle(color: Colors.white) : null;

    return Column(
      children: [
        Padding(
          padding: EdgeInsets.only(bottom: 12.h),
          child: TextField(
            controller: makeController,
            style: fieldStyle,
            cursorColor: lightOnDark ? Colors.white : null,
            decoration: deco('Make *'),
          ),
        ),
        TextField(
          controller: modelController,
          style: fieldStyle,
          cursorColor: lightOnDark ? Colors.white : null,
          decoration: deco('Model *'),
        ),
      ],
    );
  }
}
